import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CloudFormation, DescribeChangeSetCommand, paginateListChangeSets } from "@aws-sdk/client-cloudformation";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { logDiff } from "./lib/diff.mjs";

/**
 * @param {import('@aws-sdk/client-cloudformation').ResourceChange} resourceChange
 * @param {boolean} showUnchangedProperties
 */
function logChange(resourceChange, showUnchangedProperties) {
  const before = resourceChange.BeforeContext ? JSON.parse(resourceChange.BeforeContext) : undefined;
  const after = resourceChange.AfterContext ? JSON.parse(resourceChange.AfterContext) : undefined;
  if (before) before.Type = resourceChange.ResourceType;
  if (after) after.Type = resourceChange.ResourceType;
  logDiff(
    before,
    after,
    resourceChange.Action ?? "Default",
    resourceChange.LogicalResourceId,
    "",
    showUnchangedProperties,
  );
}

/**
 * @param {CloudFormation} cfn
 * @param {string} changeSetId
 */
async function getChangeSetChanges(cfn, changeSetId) {
  if (changeSetId.startsWith("file://")) {
    const contents = readFileSync(changeSetId.replace("file://", ""), "utf-8");
    const changeSet = JSON.parse(contents);
    return /** @type {Array<import("@aws-sdk/client-cloudformation").Change>} */ (changeSet.Changes ?? []);
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
  return response.Changes ?? [];
}

/**
 * @param {CloudFormation} cfn
 * @param {string} changeSetId
 * @param {string} [path]
 * @param {boolean} [showUnchangedProperties]
 */
async function printChangeSet(cfn, changeSetId, path, showUnchangedProperties) {
  /** @type {Record<string, import("@aws-sdk/client-cloudformation").ResourceChangeDetail>} */
  const changeDetailsByPath = {};
  for (const change of await getChangeSetChanges(cfn, changeSetId)) {
    for (const detail of change.ResourceChange?.Details ?? []) {
      if (detail.Target?.Path) {
        changeDetailsByPath[detail.Target?.Path] = detail;
      }
    }
  }
  const totals = {
    Add: 0,
    Modify: 0,
    Remove: 0,
    Import: 0,
    Dynamic: 0,
  };
  if (!path) path = "";

  const changes = await getChangeSetChanges(cfn, changeSetId);
  for (const change of changes) {
    const resourceChange = change.ResourceChange;
    if (!resourceChange) continue;
    const logicalId = `${path}${resourceChange.LogicalResourceId}`;
    console.log();
    if (resourceChange.Action === "Modify" && resourceChange.Replacement !== "False") {
      console.log(chalk.red(`- ${logicalId}: # WARNING may be replaced due to the following changes:`));
      totals.Add += 1;
      totals.Remove += 1;
    } else {
      if (resourceChange.Action) totals[resourceChange.Action] += 1;
    }
    logChange(
      {
        ...change.ResourceChange,
        // handle rendering nested stack resources as MyNestedStack/MyResource
        LogicalResourceId: logicalId,
      },
      showUnchangedProperties ?? false,
    );
    if (resourceChange.ChangeSetId) {
      const nestedTotals = await printChangeSet(
        cfn,
        resourceChange.ChangeSetId,
        `${logicalId}/`,
        showUnchangedProperties,
      );
      totals.Add += nestedTotals.Add;
      totals.Modify += nestedTotals.Modify;
      totals.Remove += nestedTotals.Remove;
      totals.Import += nestedTotals.Import;
      totals.Dynamic += nestedTotals.Dynamic;
    }
  }
  return totals;
}

export async function main() {
  const args = await yargs(hideBin(process.argv))
    .option("change-set-file", {
      description: "A path to a file that has the ChangeSet JSON (does not support nested stacks)",
      type: "string",
    })
    .option("change-set-name", {
      description: "The name, ARN, or file:// path of the change set",
      type: "string",
    })
    .option("stack-name", {
      description: "The name of the stack, only required if the change set ARN is not specified",
      type: "string",
    })
    .option("show-unchanged-properties", {
      description: "Show unchanged properties in the diff",
      type: "boolean",
    })
    .option("region", {
      description: "The AWS region where the change-set is located",
      type: "string",
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
      changeSetId = args.changeSetName;
    }

    const totals = await printChangeSet(cfn, changeSetId, "", args.showUnchangedProperties);
    console.log();
    console.log(`${totals.Add} resources added`);
    console.log(`${totals.Modify} resources modified`);
    console.log(`${totals.Remove} resources removed`);
    console.log(`${totals.Import} resources imported`);
    console.log(`${totals.Dynamic} undetermined resources`);
  } catch (err) {
    console.log(`Error printing ChangeSet: ${err}`);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
