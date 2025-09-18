import assert from "node:assert";
import chalk from "chalk";

/**
 * @typedef {import('@aws-sdk/client-cloudformation').ChangeAction | "Default"} ChangeAction
 */

/** @type {Record<ChangeAction, { icon: string; color: chalk.Chalk }>} */
const actionMap = {
  Add: {
    icon: "+",
    color: chalk.green,
  },
  Modify: {
    icon: "~",
    color: chalk.yellow,
  },
  Remove: {
    icon: "-",
    color: chalk.red,
  },
  Import: {
    icon: "↓",
    color: chalk.cyan,
  },
  Dynamic: {
    icon: "?",
    color: chalk.magenta,
  },
  Default: {
    icon: " ",
    color: chalk.white,
  },
};

/**
 * @param {unknown} value
 */
function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

/**
 * @param {unknown} obj
 * @param {ChangeAction} changeType
 * @param {string} key
 * @param {string} indent
 */
function logObject(obj, changeType, key, indent = "") {
  if (obj === undefined) return;
  const color = actionMap[changeType ?? "Default"].color;
  const icon = actionMap[changeType ?? "Default"].icon;
  if (Array.isArray(obj)) {
    if (key) {
      console.log(color(`${icon} ${indent}${key}:`));
      indent = indent.replace(/-/g, " ");
    }
    const newIndent = key ? `  ` : "";
    for (let i = 0; i < obj.length; i++) {
      logObject(obj[i], changeType, "", `${indent}${newIndent}- `);
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else if (typeOf(obj) === "object") {
    if (key) {
      console.log(color(`${icon} ${indent}${key}:`));
      indent = indent.replace(/-/g, " ");
    }
    const newIndent = key ? `  ` : "";
    for (const objKey in obj) {
      logObject(obj[/** @type {keyof obj} */ (objKey)], changeType, objKey, `${indent}${newIndent}`);
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else {
    if (key) {
      console.log(color(`${icon} ${indent}${key}: ${JSON.stringify(obj)}`));
    } else {
      console.log(color(`${icon} ${indent}${JSON.stringify(obj)}`));
    }
  }
}

/**
 * @param {unknown} before
 * @param {unknown} after
 * @param {ChangeAction} action
 * @param {string} [currentKey]
 * @param {string} [indent]
 * @param {boolean} [showUnchangedProperties]
 */
export function logDiff(before, after, action, currentKey = "", indent = "", showUnchangedProperties = false) {
  // handle not showing unchanged properties if not requested
  try {
    assert.deepStrictEqual(before, after);
    if (!showUnchangedProperties) return;
  } catch {}

  if (typeOf(before) !== typeOf(after)) {
    logObject(before, "Remove", currentKey, indent);
    logObject(after, action, currentKey, indent);
  } else if (Array.isArray(before) && Array.isArray(after)) {
    const maxLength = Math.max(before?.length || 0, after?.length || 0);
    const newIndent = currentKey ? `  ` : "";
    if (currentKey) {
      console.log(`  ${indent}${currentKey}:`);
      indent = indent.replace(/-/g, " ");
    }
    for (let i = 0; i < maxLength; i++) {
      logDiff(before[i], after[i], action, "", `${indent}${newIndent}- `, showUnchangedProperties);
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else if (typeof before === "object") {
    const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]).keys();
    const newIndent = currentKey ? `  ` : "";
    if (currentKey) {
      console.log(`  ${indent}${currentKey}:`);
      indent = indent.replace(/-/g, " ");
    }
    for (const key of keys) {
      logDiff(
        before?.[/** @type {keyof before} */ (key)],
        after?.[/** @type {keyof after} */ (key)],
        action,
        key,
        `${indent}${newIndent}`,
        showUnchangedProperties,
      );
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else if (before !== after) {
    logObject(before, "Remove", currentKey, indent);
    // ensure that hyphen only shows up once when logging the before object, not after
    indent = indent.replace(/-/g, " ");
    logObject(after, action, currentKey, indent);
  } else {
    logObject(after, "Default", currentKey, indent);
  }
}
