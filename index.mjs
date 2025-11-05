import { readFileSync } from "node:fs";
import { join } from "node:path";
import querystring from "node:querystring";
import { fileURLToPath } from "node:url";
import {
  CloudFormation,
  DescribeChangeSetCommand,
  PolicyAction,
  paginateListChangeSets,
} from "@aws-sdk/client-cloudformation";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { getObjectDiff } from "./lib/diff.mjs";

/**
 * @template T
 * @param {object} obj
 * @param {string} path
 * @param {T} value
 */
function set(obj, path, value) {
  const keys = path.split("/").filter((x) => x);
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // @ts-expect-error
    if (!(key in current) || typeof current[key] !== "object") {
      // @ts-expect-error
      current[key] = {};
    }
    // @ts-expect-error
    current = current[key];
  }

  // @ts-expect-error
  current[keys[keys.length - 1]] = value;
}

/**
 * @param {object} obj
 * @param {string[]} keys
 */
function sortObject(obj, keys) {
  const result = {};
  for (const key of keys) {
    if (key in obj) {
      // @ts-expect-error
      result[key] = obj[key];
    }
  }
  return Object.assign(result, obj);
}

/** @type {Record<PolicyAction, chalk.Chalk>} */
const PolicyActionMap = {
  Delete: chalk.redBright,
  Retain: chalk.yellowBright,
  ReplaceAndDelete: chalk.redBright,
  ReplaceAndRetain: chalk.yellowBright,
  ReplaceAndSnapshot: chalk.greenBright,
  Snapshot: chalk.greenBright,
};

/**
 * @param {import('@aws-sdk/client-cloudformation').ResourceChange} resourceChange
 * @param {object} [options]
 * @param {boolean} [options.showUnchangedProperties]
 * @param {boolean} [options.showColor]
 */
function logChange(resourceChange, options = {}) {
  /** @type {*} */
  const beforeStackTags = {};
  /** @type {*} */
  const afterStackTags = {};
  /** @type {Record<string, string>} */
  const replacementNotes = {};

  if (resourceChange.PolicyAction) {
    if (options.showColor) {
      replacementNotes[resourceChange.LogicalResourceId ?? ""] = PolicyActionMap[resourceChange.PolicyAction](
        `Policy: ${resourceChange.PolicyAction}`,
      );
    } else {
      replacementNotes[resourceChange.LogicalResourceId ?? ""] = `Policy: ${resourceChange.PolicyAction}`;
    }
  }

  for (const detail of resourceChange.Details ?? []) {
    if (!detail.Target) continue;
    if (!detail.Target.Path) continue;
    if (detail.Target.Attribute === "Tags" && detail.Target.Path?.startsWith("/Tags")) {
      if (detail.Target.BeforeValue) {
        try {
          set(beforeStackTags, detail.Target.Path, JSON.parse(detail.Target.BeforeValue));
        } catch (err) {
          if (err instanceof SyntaxError) {
            set(beforeStackTags, detail.Target.Path, detail.Target.BeforeValue);
          }
        }
      }
      if (detail.Target.AfterValue) {
        try {
          set(afterStackTags, detail.Target.Path, JSON.parse(detail.Target.AfterValue));
        } catch (err) {
          if (err instanceof SyntaxError) {
            set(afterStackTags, detail.Target.Path, detail.Target.AfterValue);
          }
        }
      }
    }
    if (detail.Target.RequiresRecreation === "Always") {
      replacementNotes[join(resourceChange.LogicalResourceId ?? "", detail.Target.Path)] =
        `WARNING: Causes Replacement!`;
    } else if (detail.Target.RequiresRecreation === "Conditionally") {
      replacementNotes[join(resourceChange.LogicalResourceId ?? "", detail.Target.Path)] = `May cause replacement!`;
    }
  }

  /** @type {*} */
  const before = {};
  /** @type {*} */
  const after = {};
  if (resourceChange.BeforeContext) {
    resourceChange.BeforeContext ? JSON.parse(resourceChange.BeforeContext) : undefined;
    before[resourceChange.LogicalResourceId ?? ""] = sortObject(
      {
        Type: resourceChange.ResourceType,
        ...JSON.parse(resourceChange.BeforeContext),
      },
      ["Type", "DeletionPolicy", "UpdateReplacePolicy", "Properties", "StackTags"],
    );
  }
  if (resourceChange.AfterContext) {
    resourceChange.AfterContext ? JSON.parse(resourceChange.AfterContext) : undefined;
    after[resourceChange.LogicalResourceId ?? ""] = sortObject(
      {
        Type: resourceChange.ResourceType,
        ...JSON.parse(resourceChange.AfterContext),
      },
      ["Type", "DeletionPolicy", "UpdateReplacePolicy", "Properties", "StackTags"],
    );
  }
  if (Object.keys(beforeStackTags).length > 0) {
    before[resourceChange.LogicalResourceId ?? ""].StackTags = Object.values(beforeStackTags.Tags);
  }
  if (Object.keys(afterStackTags).length > 0) {
    after[resourceChange.LogicalResourceId ?? ""].StackTags = Object.values(afterStackTags.Tags);
  }
  const diffStrings = getObjectDiff(
    before,
    after,
    {
      showUnchangedProperties: options.showUnchangedProperties ?? false,
      showColor: options.showColor ?? true,
      colorOverride: resourceChange.Action === "Import" ? chalk.cyan : undefined,
      iconOverride: resourceChange.Action === "Import" ? "↓" : undefined,
    },
    replacementNotes,
  );
  if (diffStrings.length > 0) {
    console.log(diffStrings.join("\n"));
    console.log("");
  }
}

/**
 * @param {CloudFormation} cfn
 * @param {string} changeSetId
 */
async function getChangeSetChanges(cfn, changeSetId) {
  if (changeSetId.startsWith("file://")) {
    const contents = readFileSync(changeSetId.replace("file://", ""), "utf-8");
    const response = /** @type {import("@aws-sdk/client-cloudformation").DescribeChangeSetOutput} */ (
      JSON.parse(contents)
    );
    if (!response.ChangeSetId || !response.StackId) {
      throw new Error("Change set file must contain ChangeSetId and StackId");
    }
    return {
      changeSetId: response.ChangeSetId,
      stackId: response.StackId,
      changes: response.Changes ?? [],
    };
  }
  let response;
  let attempts = 0;
  while (!response) {
    try {
      response = await cfn.send(
        new DescribeChangeSetCommand({
          ChangeSetName: changeSetId,
          IncludePropertyValues: true,
        }),
      );
    } catch (err) {
      if (!(err instanceof Error)) throw err;
      if (err.name !== "Throttling") throw err;
      if (attempts++ > 5) throw err;
      // exponential backoff sleep with jitter
      await new Promise((resolve) => setTimeout(resolve, 2 ** attempts * 1000 + Math.random() * 1000));
    }
  }
  if (!response.ChangeSetId || !response.StackId) {
    throw new Error("Change set file must contain ChangeSetId and StackId");
  }
  return {
    changeSetId: response.ChangeSetId,
    stackId: response.StackId,
    changes: response.Changes ?? [],
  };
}

/**
 * @param {CloudFormation} cfn
 * @param {string} changeSetId
 * @param {object} [options]
 * @param {boolean} [options.showUnchangedProperties]
 * @param {boolean} [options.showColor]
 * @param {string} [path]
 */
async function printChangeSet(cfn, changeSetId, options = undefined, path = "") {
  const response = await getChangeSetChanges(cfn, changeSetId);

  const totals = {
    Add: 0,
    Modify: 0,
    Remove: 0,
    Import: 0,
    Dynamic: 0,
  };

  for (const change of response.changes) {
    const resourceChange = change.ResourceChange;
    if (!resourceChange) continue;
    if (resourceChange.Action === "Modify" && resourceChange.Replacement !== "False") {
      totals.Add += 1;
      totals.Remove += 1;
    } else {
      if (resourceChange.Action) totals[resourceChange.Action] += 1;
    }

    const logicalId = `${path}${resourceChange.LogicalResourceId}`;
    logChange(
      {
        ...change.ResourceChange,
        // handle rendering nested stack resources as MyNestedStack/MyResource
        LogicalResourceId: logicalId,
      },
      options,
    );
    if (resourceChange.ChangeSetId) {
      const { totals: nestedTotals } = await printChangeSet(cfn, resourceChange.ChangeSetId, options, `${logicalId}/`);
      totals.Add += nestedTotals.Add;
      totals.Modify += nestedTotals.Modify;
      totals.Remove += nestedTotals.Remove;
      totals.Import += nestedTotals.Import;
      totals.Dynamic += nestedTotals.Dynamic;
    }
  }
  return {
    changeSetId: response.changeSetId,
    stackId: response.stackId,
    totals,
  };
}

export async function main() {
  const args = await yargs(hideBin(process.argv))
    .option("change-set-name", {
      description: "The name, ARN, or file:// path of the change set",
      type: "string",
    })
    .option("stack-name", {
      description: "The name of the stack, only required if the change set ARN is not specified",
      type: "string",
    })
    .option("show-color", {
      description: "Show color output",
      type: "boolean",
      default: true,
    })
    .option("show-unchanged-properties", {
      description: "Show unchanged properties in the diff",
      type: "boolean",
    })
    .option("region", {
      description: "The AWS region where the change-set is located",
      type: "string",
    })
    .option("debug", {
      description: "Enable debug logging",
      type: "boolean",
    })
    .help().argv;

  const cfnprops = {};
  if (args.region) {
    cfnprops.region = args.region;
  }
  const cfn = new CloudFormation(cfnprops);

  try {
    /** @type {string} */
    let changeSetId;

    if (!args.changeSetName) {
      // if no changeSetId is provided, get the latest change set for the stack
      if (!args.stackName) {
        throw new Error("Either changeSetId or stackName must be provided");
      }
      const paginator = paginateListChangeSets({ client: cfn }, { StackName: args.stackName });
      let latestChangeSet;
      for await (const page of paginator) {
        if (!page.Summaries) continue;
        const summariesWithChangeSets = page.Summaries.filter((s) => s.ChangeSetId !== undefined);
        latestChangeSet = summariesWithChangeSets[summariesWithChangeSets.length - 1];
      }
      if (!latestChangeSet || !latestChangeSet.ChangeSetId) {
        throw new Error(`No change sets found for stack ${args.stackName}`);
      }
      changeSetId = latestChangeSet?.ChangeSetId;
    } else {
      if (args.stackName) {
        // get the change set id
        const changeset = await cfn.send(
          new DescribeChangeSetCommand({
            StackName: args.stackName,
            ChangeSetName: args.changeSetName,
          }),
        );
        if (!changeset.ChangeSetId) throw new Error("Change set not found");
        changeSetId = changeset.ChangeSetId;
      } else {
        changeSetId = args.changeSetName;
      }
    }

    const response = await printChangeSet(
      cfn,
      changeSetId,
      {
        showUnchangedProperties: args.showUnchangedProperties,
        showColor: args.showColor,
      },
      "",
    );
    console.log("===== Results =====");
    console.log(`${response.totals.Add} resources added`);
    console.log(`${response.totals.Modify} resources modified`);
    console.log(`${response.totals.Remove} resources removed`);
    console.log(`${response.totals.Import} resources imported`);
    console.log(`${response.totals.Dynamic} undetermined resources`);
    console.log();
    const region = response.stackId.split(":")[3];
    const qs = querystring.stringify({
      stackId: response.stackId,
      changeSetId: response.changeSetId,
      region,
    });
    console.log(`https://${region}.console.aws.amazon.com/cloudformation/home?${qs}#/stacks/changesets/changes?${qs}`);
  } catch (err) {
    console.log(`Error printing ChangeSet: ${err}`);
    if (args.debug) {
      throw err;
    }
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
