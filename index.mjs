import { fileURLToPath } from "url";
import { CloudFormation, DescribeChangeSetCommand } from "@aws-sdk/client-cloudformation";
import chalk from "chalk";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { logDiff } from "./lib/diff.mjs";

const cfn = new CloudFormation();

/**
 * @param {import('@aws-sdk/client-cloudformation').ResourceChange} resourceChange
 */
function logChange(resourceChange) {
  console.log();
  if (resourceChange.Action === "Modify" && resourceChange.Replacement !== "False") {
    console.log(
      chalk.red(`# [!] WARNING: ${resourceChange.LogicalResourceId} may be replaced due to the following changes:`)
    );
  }

  const before = resourceChange.BeforeContext ? JSON.parse(resourceChange.BeforeContext) : undefined;
  const after = resourceChange.AfterContext ? JSON.parse(resourceChange.AfterContext) : undefined;
  if (before) before.Type = resourceChange.ResourceType;
  if (after) after.Type = resourceChange.ResourceType;
  logDiff(before, after, resourceChange.Action ?? "Default", resourceChange.LogicalResourceId);
}

/**
 * @param {string} changeSetId
 * @param {string} [stackName]
 * @param {string} [path]
 */
async function printChangeSet(changeSetId, stackName, path) {
  const totals = {
    Add: 0,
    Modify: 0,
    Remove: 0,
    Import: 0,
    Dynamic: 0,
  };
  if (!path) path = "";
  const response = await cfn.send(
    new DescribeChangeSetCommand({
      ChangeSetName: changeSetId,
      StackName: stackName,
      IncludePropertyValues: true,
    })
  );

  for (let change of response.Changes ?? []) {
    const resourceChange = change.ResourceChange;
    if (!resourceChange) continue;
    if (resourceChange.Action) totals[resourceChange.Action] += 1;
    const logicalId = `${path}${resourceChange.LogicalResourceId}`;
    logChange({
      ...change.ResourceChange,
      // handle rendering nested stack resources as MyNestedStack/MyResource
      LogicalResourceId: logicalId,
    });
    if (resourceChange.ChangeSetId) {
      // todo better totals, since change sets are not super reliable
      const nestedTotals = await printChangeSet(resourceChange.ChangeSetId, undefined, `${logicalId}/`);
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
    })
    .option("stack-name", {
      description: "The name of the stack, only required if the change set ARN is not specified",
    })
    .demandOption("change-set-name")
    .help().argv;
  if (typeof args.changeSetName !== "string") {
    console.log("Invalid arguments, change-set-name must be a string, received: ", args.changeSetName);
    process.exit(1);
  } else if (args.stackName && typeof args.stackName !== "string") {
    console.log("Invalid arguments, stack-name must be a string, received: ", args.stackName);
    process.exit(1);
  }

  const totals = await printChangeSet(args.changeSetName, /** @type {string | undefined} */ (args.stackName));
  console.log();
  console.log(`${totals.Add} resources added`);
  console.log(`${totals.Modify} resources modified`);
  console.log(`${totals.Remove} resources removed`);
  console.log(`${totals.Import} resources imported`);
  console.log(`${totals.Dynamic} undetermined resources`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
