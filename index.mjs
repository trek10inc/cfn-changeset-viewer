import { fileURLToPath } from "url";
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
 * @param {string} [changeSetId]
 * @param {string} [stackName]
 * @param {string} [path]
 * @param {boolean} [showUnchangedProperties]
 */
async function printChangeSet(cfn, changeSetId, stackName, path, showUnchangedProperties) {
  if (!changeSetId) {
    if (!stackName) {
      throw new Error("Either changeSetId or stackName must be provided");
    }
    const paginator = paginateListChangeSets(
      {
        client: cfn,
      },
      { StackName: stackName },
    );
    for await (const page of paginator) {
      if (!page.Summaries) {
        continue;
      }
      const summariesWithChangeSets = page.Summaries.filter((s) => s.ChangeSetId !== undefined);
      changeSetId = /** @type {string} */ (summariesWithChangeSets[summariesWithChangeSets.length - 1]?.ChangeSetId);
    }
  }
  console.log(changeSetId);
  const totals = {
    Add: 0,
    Modify: 0,
    Remove: 0,
    Import: 0,
    Dynamic: 0,
  };
  if (!path) path = "";
  let response;
  let attempts = 0;

  while (!response) {
    try {
      response = await cfn.send(
        new DescribeChangeSetCommand({
          ChangeSetName: changeSetId,
          StackName: stackName,
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

  for (let change of response.Changes ?? []) {
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
      const nestedTotals = await printChangeSet(cfn, resourceChange.ChangeSetId, undefined, `${logicalId}/`);
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
    .option("change-set-name", {
      description: "The name or ARN of the change set",
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

  let cfnprops = {};
  if (args.region) {
    cfnprops.region = args.region;
  }
  const cfn = new CloudFormation(cfnprops);

  try {
    const totals = await printChangeSet(cfn, args.changeSetName, args.stackName, "", args.showUnchangedProperties);
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
