# cfn-changeset-viewer

## 0.3.4

### Patch Changes

- feat(tags): handle JSON parsing errors for tag values

## 0.3.3

### Patch Changes

- fix(diff): refactor diff module, return strings, handle edge cases
- feat(diff): match array elements based on most-similar property keys
- fix(cli): handle change-set-name and stack-name arguments
- fix(viewer): dont override action for resource replacement
- feat(cli): add debug flag

## 0.3.2

### Patch Changes

- fix(viewer): dont override action for resource replacement
- feat(cli): add debug flag

## 0.3.1

### Patch Changes

- fix(cli): handle change-set-name and stack-name arguments

## 0.3.0

### Minor Changes

- rewrite diff logging functionality into two phases, diff builder and diff logger
- add --no-color CLI option to disable color output
- add tests

## 0.2.1

### Patch Changes

- remove debug log statement

## 0.2.0

### Minor Changes

- query for the latest change set if only given the stack name

## 0.1.0

### Minor Changes

- add --region CLI option to configure cloudformation client directly with explicit region

## 0.0.5

### Patch Changes

- add exponential backoff to cfn api call

## 0.0.4

### Patch Changes

- 8bc6b81: use changeset before and after contexts to generate diff
