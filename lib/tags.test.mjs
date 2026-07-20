import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { getVisibleStackTags, stripHiddenPropertyTags } from "./tags.mjs";

describe("lib/tags.mjs", () => {
  it("passes tags through unchanged when nothing is hidden", () => {
    const before = { 1: { Value: "hello" }, 2: { Key: "ToRemoveStack", Value: "bar" } };
    const after = { 1: { Value: "world" }, 2: { Key: "ToAddStack", Value: "baz" } };
    const result = getVisibleStackTags(before, after, [], []);
    assert.deepEqual(result.before, [{ Value: "hello" }, { Key: "ToRemoveStack", Value: "bar" }]);
    assert.deepEqual(result.after, [{ Value: "world" }, { Key: "ToAddStack", Value: "baz" }]);
  });

  it("returns empty arrays for undefined containers", () => {
    const result = getVisibleStackTags(undefined, undefined, ["Version"], []);
    assert.deepEqual(result, { before: [], after: [] });
  });

  it("recovers the key of a value-only change and hides it on both sides", () => {
    // /Tags/1/Value changed hello -> world, the key is omitted by CloudFormation
    const before = { 1: { Value: "hello" }, 2: { Key: "ToRemoveStack", Value: "bar" } };
    const after = { 1: { Value: "world" }, 2: { Key: "ToAddStack", Value: "baz" } };
    // stack-level tags carry the after value, letting us recover Key "Version"
    const stackTags = [{ Key: "Version", Value: "world" }, { Key: "ToAddStack", Value: "baz" }];
    const result = getVisibleStackTags(before, after, ["Version"], stackTags);
    assert.deepEqual(result.before, [{ Key: "ToRemoveStack", Value: "bar" }]);
    assert.deepEqual(result.after, [{ Key: "ToAddStack", Value: "baz" }]);
  });

  it("hides a tag whose key is present in the change detail", () => {
    const before = { 1: { Value: "hello" }, 2: { Key: "ToRemoveStack", Value: "bar" } };
    const after = { 1: { Value: "world" }, 2: { Key: "ToAddStack", Value: "baz" } };
    const result = getVisibleStackTags(before, after, ["ToAddStack"], []);
    assert.deepEqual(result.before, [{ Value: "hello" }]);
    assert.deepEqual(result.after, [{ Value: "world" }]);
  });

  it("hides tags from the whole-array shape by key", () => {
    // Target.Path "/Tags" yields a full array of {Key, Value} entries
    const after = [
      { Key: "environment", Value: "production" },
      { Key: "owner", Value: "team" },
    ];
    const result = getVisibleStackTags(undefined, after, ["environment"], []);
    assert.deepEqual(result.before, []);
    assert.deepEqual(result.after, [{ Key: "owner", Value: "team" }]);
  });

  it("hides nothing when the name does not match", () => {
    const before = { 1: { Value: "hello" } };
    const after = { 1: { Value: "world" } };
    const stackTags = [{ Key: "Version", Value: "world" }];
    const result = getVisibleStackTags(before, after, ["Nope"], stackTags);
    assert.deepEqual(result.before, [{ Value: "hello" }]);
    assert.deepEqual(result.after, [{ Value: "world" }]);
  });

  it("empties both sides when the hidden tag is the only change", () => {
    const before = { 1: { Value: "hello" } };
    const after = { 1: { Value: "world" } };
    const stackTags = [{ Key: "Version", Value: "world" }];
    const result = getVisibleStackTags(before, after, ["Version"], stackTags);
    assert.deepEqual(result, { before: [], after: [] });
  });

  it("hides a removed tag resolvable only on the before side", () => {
    // a removed tag exists in before but not after; its key resolves only from beforeTags
    const before = { 1: { Key: "Version", Value: "1.0" }, 2: { Key: "Keep", Value: "x" } };
    const after = { 2: { Key: "Keep", Value: "x" } };
    const result = getVisibleStackTags(before, after, ["Version"], []);
    assert.deepEqual(result.before, [{ Key: "Keep", Value: "x" }]);
    assert.deepEqual(result.after, [{ Key: "Keep", Value: "x" }]);
  });
});

describe("lib/tags.mjs stripHiddenPropertyTags", () => {
  it("removes the named tag from a resource's Properties.Tags", () => {
    const node = {
      Bucket: {
        Type: "AWS::S3::Bucket",
        Properties: {
          Tags: [
            { Key: "Version", Value: "2.0" },
            { Key: "Name", Value: "my-bucket" },
          ],
        },
      },
    };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node.Bucket.Properties.Tags, [{ Key: "Name", Value: "my-bucket" }]);
  });

  it("removes the named tag from nested TagSpecifications", () => {
    const node = {
      Properties: {
        LaunchTemplateData: {
          TagSpecifications: [
            { ResourceType: "instance", Tags: [{ Key: "Version", Value: "2.0" }, { Key: "App", Value: "web" }] },
          ],
        },
      },
    };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node.Properties.LaunchTemplateData.TagSpecifications[0].Tags, [{ Key: "App", Value: "web" }]);
  });

  it("leaves non-matching tags untouched", () => {
    const node = { Properties: { Tags: [{ Key: "Name", Value: "my-bucket" }] } };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node.Properties.Tags, [{ Key: "Name", Value: "my-bucket" }]);
  });

  it("tolerates resources without tags", () => {
    const node = { Properties: { BucketName: "x" } };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node, { Properties: { BucketName: "x" } });
  });

  it("keeps tag entries that have no Key", () => {
    const node = { Properties: { Tags: [{ Value: "orphan" }, { Key: "Version", Value: "2.0" }] } };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node.Properties.Tags, [{ Value: "orphan" }]);
  });

  it("leaves map-form Tags untouched (only list form is filtered)", () => {
    const node = { Properties: { Tags: { Version: "2.0", Name: "x" } } };
    stripHiddenPropertyTags(node, new Set(["Version"]));
    assert.deepEqual(node.Properties.Tags, { Version: "2.0", Name: "x" });
  });
});
