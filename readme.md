# cfn-changeset-viewer

This CLI will view the changes calculated in a CloudFormation ChangeSet in a more human-friendly way, including rendering details from a nested change set.

## Usage

```txt
cfn-changeset-viewer <changeset-id>
Options:
  --version                    Show version number [boolean]
  --change-set-name            The name or ARN of the change set [string] [required]
  --stack-name                 The name of the stack, only required if the change set ARN is not specified [string]
  --show-unchanged-properties  Show unchanged properties in the diff [boolean]
  --help                       Show help [boolean]
Usage:
  <changeset-id> the id of the changeset to view
```

## Display

Each changed resource will be printed to stdout.
If a resource is a nested stack, the nested stack's changeset will be printed as well, recursively.
`LogicalId`s of the event's resource for nested stacks will be rendered as `NestedStack/NestedResource`)
An icon showing what kind of change has been made (Add: `+`, Modify: `~`, Remove: `-`, Import: `↓`, Dynamic: `?`)
A warning will be logged for resource changes that may result in a replacement.

## Example

```sh
$ npx cfn-changeset-viewer --change-set-name arn:aws:cloudformation:us-east-1:123123123123:changeSet/release-42-1-FooBar

  ApiStack:
    Properties:
-     TemplateURL: "https://s3.us-east-2.amazonaws.com/bucket/some-template.template"
~     TemplateURL: "https://s3.us-east-2.amazonaws.com/bucket/some-other-template.template"

  ApiStack/SomeRole:
    Properties:
      Policies:
          PolicyDocument:
            Statement:
              - Action:
~                 - "s3:PutObject"

  Bucket:
    Properties:
      Tags:
-       - Value: "changeset-test-bucket-old"
~         Value: "changeset-test-bucket-new"
-         Key: "SomeOtherTag"
~         Key: "SomeDifferentTag"

  MyCooLStack:
    Properties:
-     TemplateURL: "https://s3.us-east-2.amazonaws.com/bucket/some-template.template"
~     TemplateURL: "https://s3.us-east-2.amazonaws.com/bucket/some-other-template.template"

- OtherStack/Bucket: # WARNING may be replaced due to the following changes:
  OtherStack/Bucket:
    Properties:
~     BucketName: "new-bucket-name"

1 resources added
4 resources modified
1 resources removed
0 resources imported
0 undetermined resources
```
