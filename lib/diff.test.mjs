import { strict as assert } from "node:assert";
import { afterEach, beforeEach, describe, it, mock } from "node:test";
import { Logger, logObjectDiff } from "./diff.mjs";

/**
 * @param {string} s
 */
function dedent(s) {
  const lines = s.split("\n").filter((line) => line.trim().length > 0);
  let indent = Infinity;
  for (const line of lines) {
    const match = line.match(/^(\s*)/);
    if (match) {
      indent = Math.min(indent, match[1].length);
    }
  }
  return lines.map((line) => line.slice(indent)).join("\n");
}

/**
 * @param {string} leftStr
 * @param {string} rightStr
 * @param {number} columnWidth
 * @param {string} separator
 */
function printTwoColumns(leftStr, rightStr, columnWidth = 40, separator = " | ") {
  /** @type {string[]} */
  const resultLines = [];
  // Split strings into lines
  const leftLines = leftStr.split("\n");
  const rightLines = rightStr.split("\n");

  // Get the maximum number of lines
  const maxLines = Math.max(leftLines.length, rightLines.length);

  // Print each line
  for (let i = 0; i < maxLines; i++) {
    const leftLine = leftLines[i] || "";
    const rightLine = rightLines[i] || "";

    // Pad or truncate left column to fixed width
    const leftPadded = leftLine.padEnd(columnWidth).substring(0, columnWidth);

    resultLines.push(`${leftPadded}${separator}${rightLine}`);
  }
  return resultLines.join("\n");
}

/**
 * @param {string} actual
 * @param {string} expected
 */
function errorString(actual, expected) {
  return `\n${printTwoColumns(`===ACTUAL===\n${actual}`, `===EXPECTED===\n${expected}`)}`;
}

describe("logDiff", () => {
  /** @type {import("node:test").Mock<Logger.print>} */
  let mockPrint;

  beforeEach(() => {
    mockPrint = mock.method(Logger, "print", () => undefined);
  });
  afterEach(() => {
    mock.restoreAll();
    mock.reset();
  });

  it("simple diff", () => {
    logObjectDiff("before", "after", { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - "before"
      + "after"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("other simple diff", () => {
    logObjectDiff("foo", "bar", { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - "foo"
      + "bar"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple object", () => {
    const before = { hello: "world" };
    const after = { hello: "moon" };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - hello: "world"
      + hello: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple object property type change", () => {
    const before = { hello: [{ world: "world" }] };
    const after = { hello: [{ world: ["world"] }] };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        hello:
      -   - world: "world"
      +   - world:
      +       - "world"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("object multiple keys", () => {
    const before = { hello: "world", goodbye: "moon" };
    const after = { hello: "moon", goodbye: "moon" };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - hello: "world"
      + hello: "moon"
        goodbye: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("nested object", () => {
    const before = { hello: { goodbye: "world" } };
    const after = { hello: { goodbye: "moon" } };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        hello:
      -   goodbye: "world"
      +   goodbye: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("multiple nested object", () => {
    const before = {
      hello: {
        foo: { yee: "haw" },
        world: { goodbye: "world" },
      },
    };
    const after = {
      hello: {
        foo: { yee: "haw" },
        world: { goodbye: "moon" },
      },
    };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        hello:
          foo:
            yee: "haw"
          world:
      -     goodbye: "world"
      +     goodbye: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("multiple nested object property update", () => {
    const before = {
      hello: {
        foo: { yee: "haw" },
        world: { goodbye: "world" },
      },
    };
    const after = {
      hello: {
        foo: { yee: "haw" },
        moon: { goodbye: "moon" },
      },
    };
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        hello:
          foo:
            yee: "haw"
      -   world:
      -     goodbye: "world"
      +   moon:
      +     goodbye: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array", () => {
    const before = ["hello", "world"];
    const after = ["hello", "moon"];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        - "hello"
      - - "world"
      + - "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array unchanged", () => {
    const before = ["hello", "world", "i", "like", "pie"];
    const after = ["hello", "world", "i", "like", "pie"];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        - "hello"
        - "world"
        - "i"
        - "like"
        - "pie"
    `)
      .split("\n")
      .map((x) => `  ${x}`)
      .join("\n");
    assert.equal(actual, expected, errorString(actual, expected));
  });
  it("string to empty array", () => {
    const before = "hello";
    /** @type {any[]} */
    const after = [];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - "hello"
      + []
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array reordered", () => {
    const before = ["alice", "bob", "charlie", "david"];
    const after = ["charlie", "alice", "bob", "david"];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      + - "charlie"
        - "alice"
        - "bob"
      - - "charlie"
        - "david"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array compliated reorder", () => {
    const before = ["alice", "bob", "charlie", "david", "elenor", "farquad"];
    const after = ["charlie", "farquad", "alice", "elenor", "bob", "david"];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      + - "charlie"
      + - "farquad"
        - "alice"
      + - "elenor"
        - "bob"
      - - "charlie"
        - "david"
      - - "elenor"
      - - "farquad"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array of objects", () => {
    const before = [
      {
        name: "alice",
        age: 30,
      },
      {
        name: "bob",
        age: 30,
      },
    ];
    const after = [
      {
        name: "alice",
        age: 31,
      },
      {
        name: "bob",
        age: 30,
      },
      {
        name: "charlie",
        age: 32,
      },
    ];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - - name: "alice"
      -   age: 30
      + - name: "alice"
      +   age: 31
        - name: "bob"
          age: 30
      + - name: "charlie"
      +   age: 32
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array of objects with removals and additions", () => {
    const before = [
      {
        name: "alice",
        age: 30,
      },
      {
        name: "bob",
        age: 30,
      },
    ];
    const after = [
      {
        name: "alice",
        age: 30,
      },
      {
        name: "charlie",
        age: 30,
      },
    ];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        - name: "alice"
          age: 30
      - - name: "bob"
      -   age: 30
      + - name: "charlie"
      +   age: 30
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array of strings to objects", () => {
    const before = ["foo", "alice", "bob"];
    const after = [
      "foo",
      {
        name: "alice",
        age: 30,
      },
      {
        name: "charlie",
        age: 30,
      },
    ];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
        - "foo"
      - - "alice"
      + - name: "alice"
      +   age: 30
      - - "bob"
      + - name: "charlie"
      +   age: 30
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array of objects with nested arrays", () => {
    const before = [
      {
        name: "alice",
        age: 30,
        pets: ["dog"],
      },
      {
        name: "charlie",
        age: 30,
        pets: ["fish"],
      },
    ];
    const after = [
      {
        name: "alice",
        pets: ["dog", "cat"],
      },
      {
        name: "charlie",
        age: 30,
        pets: ["fish"],
      },
    ];
    logObjectDiff(before, after, { showUnchangedProperties: true, showColor: false });
    const actual = mockPrint.mock.calls
      .map((call) => call.arguments[0])
      .join("")
      .trimEnd();
    const expected = dedent(`
      - - name: "alice"
      -   age: 30
      -   pets:
      -     - "dog"
      + - name: "alice"
      +   pets:
      +     - "dog"
      +     - "cat"
        - name: "charlie"
          age: 30
          pets:
            - "fish"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });
});
