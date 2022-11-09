#!/usr/bin/env node
const AWS = require('aws-sdk');
const chalk = require('chalk');
const yargs = require('yargs');
const { hideBin } = require('yargs/helpers');

const CloudFormation = new AWS.CloudFormation();

const actionIconMap = {
  'Add': '[+]',
  'Modify': '[~]',
  'Remove': '[-]',
  'Import': '[↓]',
  'Dynamic': '[?]',
}

const resourceReplacementIconMap = {
  'True': '[!]',
  'Conditional': '[?]',
  'False': '',
}

const resourceLineColorMap = {
  'Add': 'green',
  'Modify': 'yellow',
  'Remove': 'red',
  'Import': 'blue',
  'Dynamic': 'magenta'
}

const propertyReplacementMap = {
  'Always': '[!]',
  'Never': '',
  'Conditionally': '[?]',
}

function chunkString(str, length) {
  const numChunks = Math.ceil(str.length / length);
  const chunks = new Array(numChunks);

  for (let i = 0, o = 0; i < numChunks; ++i, o += length) {
    chunks[i] = str.substr(o, length);
  }

  return chunks;
}

/**
 * @param {Array} row
 * @param {string} color
 * @param {string} style
 */
 function logLine(row, color, style) {
  const numberOfTerminalColumns = Math.floor(process.stdout.columns * 0.8) || 132;
  const columnWidths = [
    3,
    3,
    (numberOfTerminalColumns - 6) / 4,
    (numberOfTerminalColumns - 6) / 4,
    (numberOfTerminalColumns - 6) / 4,
    (numberOfTerminalColumns - 6) / 4,
  ];
  const logLines = [
    chunkString(row[0] || '', columnWidths[0]),
    chunkString(row[1] || '', columnWidths[1]),
    chunkString(row[2] || '', columnWidths[2]),
    chunkString(row[3] || '', columnWidths[3]),
    chunkString(row[4] || '', columnWidths[4]),
    chunkString(row[5] || '', columnWidths[5]),
  ];
  const numberOfLines = logLines.map((arr) => arr.length).sort((a, b) => a - b).pop();
  for (let i = 0; i < numberOfLines; i++) {
    const message = [
      (logLines?.[0]?.[i] || '').padEnd(columnWidths[0]),
      (logLines?.[1]?.[i] || '').padEnd(columnWidths[1]),
      (logLines?.[2]?.[i] || '').padEnd(columnWidths[2]),
      (logLines?.[3]?.[i] || '').padEnd(columnWidths[3]),
      (logLines?.[4]?.[i] || '').padEnd(columnWidths[4]),
      (logLines?.[5]?.[i] || '').padEnd(columnWidths[5]),
      (logLines?.[6]?.[i] || '').padEnd(columnWidths[6]),
    ].join('  ');
    if (color) {
      if (style) console.log(chalk[color][style](message))
      else console.log(chalk[color](message))
    }
    else console.log(message);
  }
}

/**
 * @param {import('aws-sdk').CloudFormation.ResourceChange} resourceChange
 */
 function logChange(resourceChange) {
  const resourceReplacement = resourceReplacementIconMap[resourceChange.Replacement]
  logLine([
    actionIconMap[resourceChange.Action] || '',
    resourceReplacement,
    resourceChange.ResourceType || '',
    resourceChange.LogicalResourceId || '',
    '',
    '',
  ], resourceLineColorMap[resourceChange.Action], resourceReplacement ? 'bold' : undefined)
  for (let changeDetail of resourceChange.Details) {
    const changeSourceMap = {
      'ParameterReference': `!Ref ${changeDetail.CausingEntity}`,
      'ResourceReference': `!Ref ${changeDetail.CausingEntity}`,
      'ResourceAttribute': `!GetAtt ${changeDetail.CausingEntity}`,
      'DirectModification': 'direct modification',
      'Automatic': 'automatic change',
    };
    logLine([
      '',
      '',
      '',
      '',
      `${changeDetail.Target.Attribute}${changeDetail.Target.Name ? '.' : ''}${changeDetail.Target.Name || ''}`,
      changeSourceMap[changeDetail.ChangeSource] || changeDetail.CausingEntity,
    ]);
  }
}

/**
 * @param {string} changeSetId
 * @param {string} path
 */
 async function printChangeSet(changeSetId, stackName, path) {
  const totals = {
    Add: 0,
    Modify: 0,
    Remove: 0,
    Import: 0,
    Dynamic: 0,
  };
  if (!path) path = '';
  const response = await CloudFormation.describeChangeSet({ ChangeSetName: changeSetId, StackName: stackName }).promise();
  for (let change of response.Changes) {
    const resourceChange = change.ResourceChange;
    totals[resourceChange.Action] += 1;
    const logicalId = `${path}${resourceChange.LogicalResourceId}`;
    logChange({
      ...change.ResourceChange,
      // handle rendering nested stack resources as MyNestedStack/MyResource
      LogicalResourceId: logicalId,
    });
    if (resourceChange.ChangeSetId) {
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

async function main() {
  const args = yargs(hideBin(process.argv))
    .option('change-set-name', {
      description: 'The name or ARN of the change set'
    })
    .option('stack-name', {
      description: 'The name of the stack, only required if the change set ARN is not specified'
    })
    .demandOption('change-set-name')
    .help().argv;
  logLine([
    '',
    'RPL',
    'RESOURCE TYPE',
    'LOGICAL ID',
    'PROPERTY',
    'CAUSE',
  ]);
  const totals = await printChangeSet(args.changeSetName, args.stackName);
  console.log(`${totals.Add} resources added`);
  console.log(`${totals.Modify} resources modified`);
  console.log(`${totals.Remove} resources removed`);
  console.log(`${totals.Import} resources imported`);
  console.log(`${totals.Dynamic} undetermined resources`);
}

if (require.main === module) {
  main();
}
