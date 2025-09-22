# cfn-changeset-viewer

This CLI will view the changes calculated in a CloudFormation ChangeSet in a more human-friendly way, including rendering details from a nested change set.

## Usage

```txt
cfn-changeset-viewer <options>
Options:
  --version                    Show version number [boolean]
  --change-set-name            The name, ARN, or file:// path of the change set [string]
  --stack-name                 The name of the stack, only required if the change set ARN is not specified [string]
  --no-color                   Disable color output [boolean] [default: false]
  --show-unchanged-properties  Show unchanged properties in the diff [boolean]
  --region                     The AWS region where the change-set is located [string]
  --help                       Show help [boolean]
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
  MyNestedStackResouce:
    Properties:
-     TemplateURL: "https://s3.us-east-2.amazonaws.com/mybucket/408996fc760779d1891d761517c12efe.template"
+     TemplateURL: "https://s3.us-east-2.amazonaws.com/mybucket/586265672cdf10ec6d2e2155635f1326.template"
+ MyNestedStackResouce/BucketToAdd:
+   Type: "AWS::S3::Bucket"
+   Properties: {}
- MyNestedStackResouce/BucketToRemove:
-   Type: "AWS::S3::Bucket"
-   Properties: {}
  # WARNING may be replaced:
- MyNestedStackResouce/BucketToReplace:
-   Type: "AWS::S3::Bucket"
-   Properties:
-     BucketName: "cfn-changeset-viewer-999999999999-us-east-2-bucket"
+     BucketName: "cfn-changeset-viewer-999999999999-us-east-2-bucket2"
  MyNestedStackResouce/BucketToUpdate:
    Properties:
+     VersioningConfiguration:
+       Status: "Enabled"
  MyNestedStackResouce/BucketWithTags:
    Properties:
      Tags:
        - Value: "Foo"
          Key: "ToKeep"
-       - Value: "Bar"
-         Key: "ToRemove"
+       - Value: "Baz"
+         Key: "ToAdd"
-       - Value: "Hello"
-         Key: "ToUpdate"
+       - Value: "World"
+         Key: "ToUpdate"
===== Results =====
2 resources added
3 resources modified
2 resources removed
0 resources imported
0 undetermined resources
```

## Development

This project is managed by [Nix](https://nixos.org/).
Services Flake is used to run a test watcher as well as running the viewer against the [examples](./examples) directory.
Read more about Services Flake [here](https://github.com/juspay/services-flake).
To begin, make sure Nix is installed and run the following:

```sh
$ nix run .#dev
```
