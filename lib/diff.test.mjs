import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { getObjectDiff } from "./diff.mjs";

/**
 * @param {string} s
 */
function dedent(s) {
  const lastLine = s.split("\n").pop();
  if (!lastLine) return s;
  const lines = s.split("\n").filter((line) => line.trim().length > 0);
  let indent = lastLine.length + 2;
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

describe("lib/diff.test.mjs", () => {
  const getObjectDiffOptions = { showUnchangedProperties: true, showColor: false };

  it("simple diff", () => {
    const actual = getObjectDiff("before", "after", getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - "before"
      + "after"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple diff string to number", () => {
    const actual = getObjectDiff("foo", 42, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - "foo"
      + 42
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple diff empty string to boolean", () => {
    const actual = getObjectDiff("", false, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - ""
      + false
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("null diff", () => {
    const actual = getObjectDiff(null, 123, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      + 123
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("undefined diff", () => {
    const actual = getObjectDiff(undefined, 123, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      + 123
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple object", () => {
    const before = { hello: "world" };
    const after = { hello: "moon" };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - hello: "world"
      + hello: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("empty object unchanged", () => {
    const before = {};
    const after = {};
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        {}
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("empty object to object", () => {
    const before = {};
    const after = { hello: "world" };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      + hello: "world"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("object to empty object", () => {
    const before = { hello: "world" };
    const after = {};
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - hello: "world"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("object with additions and removals", () => {
    const before = { hello: "world", goodbye: "moon" };
    const after = { hello: "world", welcome: "sun" };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        hello: "world"
      - goodbye: "moon"
      + welcome: "sun"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple nested object", () => {
    const before = {
      foo: { hello: "world" },
    };
    const after = {
      foo: { hello: "moon" },
    };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        foo:
      -   hello: "world"
      +   hello: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple nested object property type change", () => {
    const before = {
      foo: { hello: "world" },
    };
    const after = {
      foo: { hello: 42 },
    };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        foo:
      -   hello: "world"
      +   hello: 42
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("object multiple keys", () => {
    const before = { hello: "world", goodbye: "moon" };
    const after = { hello: "moon", goodbye: "moon" };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - hello: "world"
      + hello: "moon"
        goodbye: "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("deeply nested object", () => {
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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

  it("deeply nested object property update", () => {
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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

  it("deeply nested object - change at multiple levels", () => {
    const before = { a: { b: { c: "level3" }, d: "level2" } };
    const after = { a: { b: { c: "changed3" }, d: "changed2" } };
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        a:
          b:
      -     c: "level3"
      +     c: "changed3"
      -   d: "level2"
      +   d: "changed2"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("empty array", () => {
    /** @type {any[]} */
    const before = [];
    /** @type {any[]} */
    const after = [];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        []
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array", () => {
    const before = ["hello", "world"];
    const after = ["hello", "moon"];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - "hello"
        - "world"
        - "i"
        - "like"
        - "pie"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("string to empty array", () => {
    const before = "hello";
    /** @type {any[]} */
    const after = [];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - "hello"
      + []
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple array reordered", () => {
    const before = ["alice", "bob", "charlie", "david"];
    const after = ["charlie", "alice", "bob", "david"];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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

  it("deeply nested arrays - change at level 4", () => {
    const before = [[[["deep"]]]];
    const after = [[[["deeper"]]]];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
      - - - - - "deep"
      + - - - - "deeper"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("nested arrays of strings unchanged", () => {
    const before = [["hello"], ["world"]];
    const after = [["hello"], ["world"]];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - - "hello"
        - - "world"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("nested arrays of strings", () => {
    const before = [["hello"], ["who", "world"]];
    const after = [["hello"], ["who", "moon"]];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - - "hello"
        - - "who"
      -   - "world"
      +   - "moon"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("nested arrays of strings index 0 changed", () => {
    const before = [["colors"], ["yellow", "red", "blue"]];
    const after = [["colors"], ["green", "red", "blue"]];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - - "colors"
      - - - "yellow"
      +   - "green"
          - "red"
          - "blue"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array with empty object", () => {
    const before = [{}];
    const after = [{}];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - {}
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("simple nested object array property type change", () => {
    const before = {
      hello: [{ world: "world" }],
    };
    const after = {
      hello: [{ world: ["world"] }],
    };
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        hello:
      -   - world: "world"
      +   - world:
      +       - "world"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array of objects unchanged", () => {
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
        name: "bob",
        age: 30,
      },
    ];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - name: "alice"
          age: 30
        - name: "bob"
          age: 30
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - name: "alice"
      -   age: 30
      +   age: 31
        - name: "bob"
          age: 30
      + - name: "charlie"
      +   age: 32
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("deeply nested arrays - with objects inside", () => {
    const before = [
      [
        [
          { name: "alice", age: 30 },
          { name: "bob", age: 31 },
        ],
      ],
    ];
    const after = [
      [
        [
          { name: "alice", age: 31 },
          { name: "bob", age: 31 },
        ],
      ],
    ];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - - - name: "alice"
      -       age: 30
      +       age: 31
            - name: "bob"
              age: 31
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("deeply nested arrays - with objects inside, second element changes", () => {
    const before = [
      [
        [
          { name: "alice", age: 30 },
          { name: "bob", age: 31 },
        ],
      ],
    ];
    const after = [
      [
        [
          { name: "alice", age: 30 },
          { name: "bob", age: 32 },
        ],
      ],
    ];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - - - name: "alice"
              age: 30
            - name: "bob"
      -       age: 31
      +       age: 32
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("mixed deep nesting - object->array->object->array", () => {
    const before = {
      level1: [
        {
          level3: ["level4"],
        },
      ],
    };
    const after = {
      level1: [
        {
          level3: ["changed4"],
        },
      ],
    };
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        level1:
          - level3:
      -       - "level4"
      +       - "changed4"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("empty structures type transformation", () => {
    const before = { empty_obj: {}, empty_arr: [], primitive: null };
    const after = { empty_obj: [], empty_arr: {}, primitive: { now: "object" } };
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
      - empty_obj: {}
      + empty_obj: []
      - empty_arr: []
      + empty_arr: {}
      + primitive:
      +   now: "object"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("array element type transformation", () => {
    const before = ["string", 42, { obj: "value" }];
    const after = [{ converted: "object" }, [1, 2, 3], "string"];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
      + - converted: "object"
      + - - 1
      +   - 2
      +   - 3
        - "string"
      - - 42
      - - obj: "value"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("multiple type transformations in same object", () => {
    const before = {
      prop1: "string",
      prop2: { nested: "value" },
      prop3: [1, 2],
    };
    const after = {
      prop1: { converted: "object" },
      prop2: "simplified",
      prop3: "single_value",
    };
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
      - prop1: "string"
      + prop1:
      +   converted: "object"
      - prop2:
      -   nested: "value"
      + prop2: "simplified"
      - prop3:
      -   - 1
      -   - 2
      + prop3: "single_value"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("complex nested array transformations", () => {
    const before = [
      {
        myvalues: ["a", "b"],
        meta: { count: 2 },
      },
    ];
    const after = [
      {
        myvalues: {
          first: "a",
          second: { transformed: "b" },
        },
        meta: ["transformed", "to", "array"],
      },
    ];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
      - - myvalues:
      -     - "a"
      -     - "b"
      + - myvalues:
      +     first: "a"
      +     second:
      +       transformed: "b"
      -   meta:
      -     count: 2
      +   meta:
      +     - "transformed"
      +     - "to"
      +     - "array"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("arrays of objects with nested arrays and type changes", () => {
    const before = [
      {
        id: 1,
        tags: ["tag1", "tag2"],
        metadata: {
          created: "2023-01-01",
          settings: ["setting1"],
        },
      },
      {
        id: 2,
        tags: ["tag3"],
        metadata: {
          created: "2023-01-02",
          settings: [],
        },
      },
    ];
    const after = [
      {
        id: 1,
        tags: ["tag1", "tag2", "tag3"],
        metadata: {
          created: "2023-01-01",
          settings: { mode: "advanced" },
        },
      },
      {
        id: 3,
        tags: ["new_tag"],
        metadata: {
          created: "2023-01-03",
          settings: ["setting2", "setting3"],
        },
      },
    ];
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        - id: 1
          tags:
            - "tag1"
            - "tag2"
      +     - "tag3"
          metadata:
            created: "2023-01-01"
      -     settings:
      -       - "setting1"
      +     settings:
      +       mode: "advanced"
      - - id: 2
      +   id: 3
          tags:
      -     - "tag3"
      +     - "new_tag"
          metadata:
      -     created: "2023-01-02"
      +     created: "2023-01-03"
            settings:
      +       - "setting2"
      +       - "setting3"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("recursive type transformation", () => {
    const before = {
      data: {
        level1: {
          level2: "string",
        },
      },
    };
    const after = {
      data: {
        level1: {
          level2: {
            level3: {
              level4: ["deep", "array"],
            },
          },
        },
      },
    };
    const actual = getObjectDiff(before, after, { showUnchangedProperties: true, showColor: false }).join("\n");
    const expected = dedent(`
        data:
          level1:
      -     level2: "string"
      +     level2:
      +       level3:
      +         level4:
      +           - "deep"
      +           - "array"
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - name: "alice"
          age: 30
      - - name: "bob"
      +   name: "charlie"
          age: 30
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });

  it("empty nested array to nested array", () => {
    const before = [[], 1, 2];
    const after = [["hello"], 1, 2];
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
      - - []
      + - - "hello"
        - 1
        - 2
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
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
    const actual = getObjectDiff(before, after, getObjectDiffOptions).join("\n");
    const expected = dedent(`
        - name: "alice"
      -   age: 30
          pets:
            - "dog"
      +     - "cat"
        - name: "charlie"
          age: 30
          pets:
            - "fish"
    `);
    assert.equal(actual, expected, errorString(actual, expected));
  });
});
