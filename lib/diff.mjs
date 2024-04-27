import chalk from "chalk";

/**
 * @typedef {import('@aws-sdk/client-cloudformation').ChangeAction} ChangeAction
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
 * @param {ChangeAction | undefined} changeType
 * @param {string} key
 * @param {string} indent
 */
function logObject(obj, changeType, key, indent = "") {
  if (obj === undefined) return;
  const color = actionMap[changeType]?.color || chalk.white;
  const icon = actionMap[changeType]?.icon ?? " ";
  if (typeOf(obj) === "array") {
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
      logObject(obj[objKey], changeType, objKey, `${indent}${newIndent}`);
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
 * @param {boolean} isFromArray
 * @param {boolean} isFromArray
 */
export function logDiff(before, after, action, currentKey = "", indent = "") {
  if (typeOf(before) !== typeOf(after)) {
    logObject(before, "Remove", currentKey, indent);
    logObject(after, action, currentKey, indent);
  } else if (typeOf(before) === "array") {
    const maxLength = Math.max(before?.length || 0, after?.length || 0);
    const newIndent = currentKey ? `  ` : "";
    if (currentKey) {
      console.log(`  ${indent}${currentKey}:`);
      indent = indent.replace(/-/g, " ");
    }
    for (let i = 0; i < maxLength; i++) {
      logDiff(before[i], after[i], action, "", `${indent}${newIndent}- `);
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else if (typeOf(before) === "object") {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]).keys();
    const newIndent = currentKey ? `  ` : "";
    if (currentKey) {
      console.log(`  ${indent}${currentKey}:`);
      indent = indent.replace(/-/g, " ");
    }
    for (const key of keys) {
      logDiff(before[key], after[key], action, key, `${indent}${newIndent}`);
      // ensure hyphen only shows up once per array element
      indent = indent.replace(/-/g, " ");
    }
  } else if (before !== after) {
    logObject(before, "Remove", currentKey, indent);
    // ensure that hyphen only shows up once when logging the before object, not after
    indent = indent.replace(/-/g, " ");
    logObject(after, action, currentKey, indent);
  } else {
    logObject(after, undefined, currentKey, indent);
  }
}
