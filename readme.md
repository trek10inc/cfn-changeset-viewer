# cfn-changeset-viewer

This CLI will view the changes calculated in a CloudFormation ChangeSet in a more human-friendly way, including rendering details from a nested change set.

## Usage

```txt
cfn-changeset-viewer <changeset-id>
Usage:
  <changeset-id> the id of the changeset to view
```

## Display

A table will be printed to stdout, scaling to fit the width of your terminal. From left to right are the following:

- An icon showing what kind of change has been made (Add: `+`, Modify: `~`, Remove: `-`, Import: `↓`, Dynamic: `?`)
- Whether or not the resource will be replaced (True: `!`, Conditional: `?`, False: empty)
- Type of the resource being changed
- LogicalId of the event's resource (for nested stacks, this will be rendered as `NestedStack/NestedResource`)
- The property being modified
- The source of that modification (`!Ref/!GetAtt`, direct modification, or [automatic change](https://docs.aws.amazon.com/AWSCloudFormation/latest/APIReference/API_ResourceChangeDetail.html))

## Example

```sh
$ npx cfn-changeset-viewer arn:aws:cloudformation:us-east-1:123123123123:changeSet/release-42-1-FooBar
     RPL  RESOURCE TYPE               LOGICAL ID                  PROPERTY                            CAUSE
[+]       AWS::CloudFormation::Stack  NestedStack
[+]       AWS::Lambda::Function       NestedStack/LambdaFunction
[+]       AWS::SQS::Queue             NestedStack/MyQueue
[-]       AWS::S3::Bucket             NestedStack/FooBucket
[+]       AWS::IAM::Role              NestedStack/TheRole
[~]  [!]  AWS::Lambda::Function       MainFunction
                                                                  Properties.Environment              direct modification
                                                                  Properties.FunctionName             direct modification
                                                                  Properties.Code                     direct modification
                                                                  Properties.MessageRetentionPeriod   direct modification
                                                                  Properties.QueueName                direct modification
...
37 resources added
16 resources modified
7 resources removed
0 resources imported
0 undetermined resources
```
