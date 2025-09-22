import { join } from "node:path";
import chalk from "chalk";

/**
 * @typedef {import('@aws-sdk/client-cloudformation').ChangeAction | "Default"} ChangeAction
 * @typedef {string | number | boolean | null} JsonPrimitive
 * @typedef {ValidJson[]} JsonArray
 * @typedef {{ [key: string]: ValidJson }} JsonObject
 * @typedef {JsonPrimitive | JsonArray | JsonObject | {}} ValidJson
 *
 * @typedef {{
 *   type: "primitive"
 *   value: JsonPrimitive
 * }} DiffNodePrimitive
 * @typedef {{
 *   type: "object"
 *   properties: Record<string, Diff>
 * }} DiffNodeObject
 * @typedef {{
 *   type: "array"
 *   items: Array<Diff>
 * }} DiffNodeArray
 * @typedef {DiffNodePrimitive | DiffNodeObject | DiffNodeArray} DiffNode
 *
 * @typedef {{
 *   action: "Add" | "Remove" | "Default" | "Import"
 *   node: DiffNode
 * }} DiffChange changes that don't require a before and after node
 *
 * @typedef {{
 *   action: "Modify"
 *   beforeNode: DiffNode
 *   afterNode: DiffNode
 * }} DiffModify used to represent a before and after change where both need to be logged
 *
 * @typedef {DiffChange | DiffModify} Diff
 *
 * @typedef {{
 *   showColor: boolean
 *   showUnchangedProperties: boolean
 *   indent: number
 * }} LogOptions
 */

export class Logger {
  /**
   * @param {string} message
   * @param {ChangeAction} action
   * @param {boolean} showColor
   */
  static logChange(message, action, showColor) {
    if (showColor) {
      if (message.includes("WARNING")) {
        Logger.print(chalk.bold(actionMap[action].color(`${actionMap[action].icon} ${message}`)));
      } else {
        Logger.print(actionMap[action].color(`${actionMap[action].icon} ${message}`));
      }
    } else {
      Logger.print(`${actionMap[action].icon} ${message}`);
    }
  }

  /**
   * @param {string} message
   * @param {string} end
   */
  static print(message, end = "") {
    process.stdout.write(`${message}${end}`);
  }
}

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
logObjectDiff;

/**
 * @param {Diff} diff
 * @param {ChangeAction} action
 * @param {LogOptions} options
 * @param {Record<string, string>} changeNotes key: path ('Resource.Properties.BucketName`), value: note to add at that path
 * @param {string} key
 * @param {string} arrayPrefix
 * @param {string} currentPath
 */
export function logDiff(diff, action, options, changeNotes = {}, key = "", arrayPrefix = "", currentPath = "") {
  const indentSpaces = " ".repeat(options.indent);
  const note = currentPath in changeNotes ? ` # ${changeNotes[currentPath]}` : "";

  if (diff.action === "Modify") {
    if (diff.beforeNode.type === "primitive" && diff.afterNode.type === "primitive") {
      const prefix = arrayPrefix || (key ? `${key}: ` : "");
      Logger.logChange(
        `${indentSpaces}${prefix}${JSON.stringify(diff.beforeNode.value)}${note}\n`,
        "Remove",
        options.showColor,
      );
      Logger.logChange(
        `${indentSpaces}${prefix}${JSON.stringify(diff.afterNode.value)}${note}\n`,
        "Add",
        options.showColor,
      );
    } else {
      logDiffNode(diff.beforeNode, "Remove", options, changeNotes, key, arrayPrefix, currentPath);
      logDiffNode(diff.afterNode, "Add", options, changeNotes, key, arrayPrefix, currentPath);
    }
    return;
  }

  // Use the passed action if it's not Default, otherwise use the diff's action
  const diffAction = action !== "Default" ? action : diff.action;
  logDiffNode(diff.node, diffAction, options, changeNotes, key, arrayPrefix, currentPath);
}

/**
 * @param {DiffNode} node
 * @param {ChangeAction} action
 * @param {LogOptions} options
 * @param {Record<string, string>} changeNotes key: path ('Resource.Properties.BucketName`), value: note to add at that path
 * @param {string} key
 * @param {string} arrayPrefix
 * @param {string} currentPath
 */
function logDiffNode(node, action, options, changeNotes = {}, key = "", arrayPrefix = "", currentPath = "") {
  const indentSpaces = " ".repeat(options.indent);
  const note = currentPath in changeNotes ? ` # ${changeNotes[currentPath]}` : "";

  if (node.type === "primitive") {
    if (!options.showUnchangedProperties && action === "Default") return;
    const prefix = arrayPrefix || (key ? `${key}: ` : "");
    Logger.logChange(`${indentSpaces}${prefix}${JSON.stringify(node.value)}${note}\n`, action, options.showColor);
    return;
  }

  if (node.type === "object") {
    const entries = Object.entries(node.properties);
    if (arrayPrefix) {
      if (entries.length === 0) {
        Logger.logChange(`${indentSpaces}${arrayPrefix}{}${note}\n`, action, options.showColor);
      } else {
        const [firstKey, firstEntry] = /** @type {[string, DiffChange]} */ (entries[0]);
        const firstNode = firstEntry.node;
        if (firstNode.type === "primitive") {
          Logger.logChange(
            `${indentSpaces}${arrayPrefix}${firstKey}: ${JSON.stringify(firstNode.value)}${note}\n`,
            action,
            options.showColor,
          );
        } else {
          Logger.logChange(`${indentSpaces}${arrayPrefix}${firstKey}:${note}\n`, action, options.showColor);
          logDiff(
            firstEntry,
            action,
            { ...options, indent: options.indent + arrayPrefix.length + 2 },
            changeNotes,
            "",
            "",
            join(currentPath, firstKey),
          );
        }

        const propertyIndent = options.indent + arrayPrefix.length;
        for (let i = 1; i < entries.length; i++) {
          const [entryKey, entryValue] = entries[i];
          const childAction = entryValue.action !== "Default" ? entryValue.action : action;
          logDiff(
            entryValue,
            childAction,
            { ...options, indent: propertyIndent, showUnchangedProperties: true },
            changeNotes,
            entryKey,
            "",
            join(currentPath, entryKey),
          );
        }
      }
    } else {
      if (entries.length === 0) {
        Logger.logChange(`${indentSpaces}${key}: {}${note}\n`, action, options.showColor);
      } else {
        if (key) {
          Logger.logChange(`${indentSpaces}${key}:${note}\n`, action, options.showColor);
        }
        for (const [objKey, objEntry] of entries) {
          const childAction = objEntry.action !== "Default" ? objEntry.action : action;
          if (action === "Default" && !options.showUnchangedProperties && !hasChanges(objEntry)) continue;
          logDiff(
            objEntry,
            childAction,
            { ...options, indent: key ? options.indent + 2 : options.indent },
            changeNotes,
            objKey,
            "",
            join(currentPath, objKey),
          );
        }
      }
    }
  }

  if (node.type === "array") {
    if (arrayPrefix) {
      const newArrayPrefix = `${arrayPrefix}-`;
      if (node.items.length > 0) {
        if (!options.showUnchangedProperties && action === "Default") {
          node.items = node.items.filter(hasChanges);
        }
        const [firstItem, ...restItems] = node.items;
        logDiff(
          firstItem,
          action,
          { ...options, indent: options.indent + arrayPrefix.length },
          changeNotes,
          "",
          newArrayPrefix,
          join(currentPath, "0"),
        );
        for (const [index, item] of restItems.entries()) {
          logDiff(
            item,
            action,
            { ...options, indent: options.indent + arrayPrefix.length },
            changeNotes,
            "",
            "- ",
            join(currentPath, String(index + 1)),
          );
        }
      } else {
        Logger.logChange(`${indentSpaces}${newArrayPrefix}[]${note}\n`, action, options.showColor);
      }
    } else {
      if (!options.showUnchangedProperties && action === "Default") {
        node.items = node.items.filter(hasChanges);
        if (node.items.length === 0) return;
      }
      if (key) {
        Logger.logChange(`${indentSpaces}${key}:${note}\n`, action, options.showColor);
      }
      if (node.items.length === 0) {
        Logger.logChange(`${indentSpaces}[]${note}\n`, action, options.showColor);
      } else {
        for (const [index, item] of node.items.entries()) {
          const arrayIndent = key ? options.indent + 2 : options.indent;
          logDiff(
            item,
            action,
            { ...options, indent: arrayIndent },
            changeNotes,
            "",
            "- ",
            join(currentPath, index.toString()),
          );
        }
      }
    }
  }
}

/**
 * Checks if a diff contains any changes (is not purely "Default")
 * @param {Diff} diff
 * @returns {boolean}
 */
function hasChanges(diff) {
  if (diff.action !== "Default") return true;

  // Check if any descendants have changes
  if (diff.node.type === "object") {
    return Object.values(diff.node.properties).some(hasChanges);
  }

  if (diff.node.type === "array") {
    return diff.node.items.some(hasChanges);
  }

  return false;
}

/**
 * @param {ValidJson} beforeValue
 * @param {ValidJson} afterValue
 * @param {"Import"} [imported]
 * @returns {Diff}
 */
function buildDiff(beforeValue, afterValue, imported) {
  // Handle null/undefined cases
  if (beforeValue == null && afterValue == null) {
    return { action: imported ?? "Default", node: { type: "primitive", value: null } };
  }

  if (beforeValue == null) {
    return { action: imported ?? "Add", node: createNodeFromValue(afterValue) };
  }

  if (afterValue == null) {
    return { action: imported ?? "Remove", node: createNodeFromValue(beforeValue) };
  }

  const beforeType = getValueType(beforeValue);
  const afterType = getValueType(afterValue);

  if (beforeType !== afterType) {
    return {
      action: "Modify",
      beforeNode: createNodeFromValue(beforeValue),
      afterNode: createNodeFromValue(afterValue),
    };
  }

  if (beforeType === "primitive") {
    if (beforeValue === afterValue) {
      return {
        action: imported ?? "Default",
        node: {
          type: "primitive",
          value: /** @type {JsonPrimitive} */ (afterValue),
        },
      };
    } else {
      return {
        action: "Modify",
        beforeNode: { type: "primitive", value: /** @type {JsonPrimitive} */ (beforeValue) },
        afterNode: { type: "primitive", value: /** @type {JsonPrimitive} */ (afterValue) },
      };
    }
  }

  if (beforeType === "array") {
    return buildArrayDiff(/** @type {JsonArray} */ (beforeValue), /** @type {JsonArray} */ (afterValue), imported);
  }

  if (beforeType === "object") {
    return buildObjectDiff(/** @type {JsonObject} */ (beforeValue), /** @type {JsonObject} */ (afterValue), imported);
  }

  throw new Error("unhandled type");
}

/**
 * @param {ValidJson} value
 */
function getValueType(value) {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return "primitive";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return "object";
}

/**
 * @param {ValidJson} value
 * @returns {DiffNode}
 */
function createNodeFromValue(value) {
  const type = getValueType(value);

  if (type === "primitive") {
    return { type: "primitive", value: /** @type {JsonPrimitive} */ (value) };
  }

  if (type === "array") {
    return {
      type: "array",
      items: /** @type {JsonArray} */ (value).map((item) => ({
        action: "Default",
        node: createNodeFromValue(item),
      })),
    };
  }

  if (type === "object") {
    /** @type {Record<string, Diff>} */
    const properties = {};
    for (const [key, val] of Object.entries(/** @type {JsonObject} */ (value))) {
      if (val === undefined) continue;
      properties[key] = { action: "Default", node: createNodeFromValue(val) };
    }
    return { type: "object", properties };
  }

  throw new Error("unrecognized object type");
}

/**
 * @param {JsonArray} beforeArray
 * @param {JsonArray} afterArray
 * @param {"Import"} [imported]
 * @returns {Diff}
 */
function buildArrayDiff(beforeArray, afterArray, imported) {
  /** @type {Diff[]} */
  const items = [];

  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeArray.length || afterIndex < afterArray.length) {
    const afterItem = afterArray[afterIndex];
    const beforeItem = beforeArray[beforeIndex];
    if (JSON.stringify(beforeItem) === JSON.stringify(afterItem)) {
      items.push({ action: imported ?? "Default", node: createNodeFromValue(afterItem) });
      beforeIndex++;
      afterIndex++;
      continue;
    }

    const foundInAfter = afterArray
      .slice(afterIndex + 1)
      .some((item) => JSON.stringify(item) === JSON.stringify(beforeItem));
    if (foundInAfter || beforeItem === undefined) {
      items.push({ action: imported ?? "Add", node: createNodeFromValue(afterItem) });
      afterIndex++;
      continue;
    }

    const foundInBefore = beforeArray
      .slice(beforeIndex + 1)
      .some((item) => JSON.stringify(item) === JSON.stringify(afterItem));
    if (foundInBefore || afterItem === undefined) {
      items.push({ action: imported ?? "Remove", node: createNodeFromValue(beforeItem) });
      beforeIndex++;
      continue;
    }

    items.push({
      action: "Modify",
      beforeNode: createNodeFromValue(beforeItem),
      afterNode: createNodeFromValue(afterItem),
    });
    beforeIndex++;
    afterIndex++;
  }

  return { action: imported ?? "Default", node: { type: "array", items } };
}

/**
 * @param {JsonObject} beforeObj
 * @param {JsonObject} afterObj
 * @param {"Import"} [imported]
 * @returns {Diff}
 */
function buildObjectDiff(beforeObj, afterObj, imported) {
  /** @type {Record<string, Diff>} */
  const properties = {};
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of allKeys) {
    const beforeValue = beforeObj[key];
    const afterValue = afterObj[key];

    if (!(key in beforeObj)) {
      properties[key] = { action: imported ?? "Add", node: createNodeFromValue(afterValue) };
    } else if (!(key in afterObj)) {
      properties[key] = { action: imported ?? "Remove", node: createNodeFromValue(beforeValue) };
    } else {
      properties[key] = buildDiff(beforeValue, afterValue);
    }
  }

  return { action: imported ?? "Default", node: { type: "object", properties } };
}

/**
 * @param {ValidJson} before the object before the change
 * @param {ValidJson} after the object after the change
 * @param {object} options
 * @param {number} [options.indent]
 * @param {ChangeAction} [options.action]
 * @param {boolean} [options.showColor]
 * @param {boolean} [options.showUnchangedProperties]
 * @param {Record<string, string>} changeNotes key: path ('Resource.Properties.BucketName`), value: note to add at that path
 */
export function logObjectDiff(before, after, options = {}, changeNotes = {}) {
  const diff = buildDiff(before, after, options.action === "Import" ? "Import" : undefined);
  logDiff(
    diff,
    options.action ?? "Default",
    {
      indent: options.indent ?? 0,
      showColor: options.showColor ?? true,
      showUnchangedProperties: options.showUnchangedProperties ?? false,
    },
    changeNotes,
  );
}
