import { join } from "node:path";
import chalk from "chalk";

/**
 * @typedef {string | number | boolean | null} JsonPrimitive
 * @typedef {ValidJson[]} JsonArray
 * @typedef {{ [key: string]: ValidJson }} JsonObject
 * @typedef {JsonPrimitive | JsonArray | JsonObject | {} | undefined} ValidJson
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
 *   action: "Add" | "Remove" | "Default"
 *   node: DiffNode
 * }} DiffChange changes that don't require a before and after node
 *
 * @typedef {{
 *   action: "Replace"
 *   beforeNode: DiffNode
 *   afterNode: DiffNode
 * }} DiffReplace used to represent a before and after change where both need to be logged
 *
 * @typedef {DiffChange | DiffReplace} Diff
 * @typedef {Diff['action']} DiffAction
 *
 * @typedef {{
 *   showColor: boolean
 *   showUnchangedProperties: boolean
 *   indent: number
 *   colorOverride?: chalk.Chalk
 *   iconOverride?: string
 * }} LogOptions
 */

/** @type {Record<DiffChange['action'], { icon: string; color: chalk.Chalk }>} */
const actionMap = {
  Default: {
    icon: " ",
    color: chalk.white,
  },
  Add: {
    icon: "+",
    color: chalk.green,
  },
  Remove: {
    icon: "-",
    color: chalk.red,
  },
};

export class Logger {
  /**
   * @param {string} message
   * @param {DiffChange['action']} action
   * @param {Partial<LogOptions>} options
   */
  static formatDiffString(message, action, options = {}) {
    if (options?.showColor ?? true) {
      const color = options?.colorOverride ?? actionMap[action].color;
      if (message.includes("WARNING")) {
        return chalk.bold(color(`${options?.iconOverride ?? actionMap[action].icon} ${message}`));
      } else {
        return color(`${options?.iconOverride ?? actionMap[action].icon} ${message}`);
      }
    } else {
      return `${options?.iconOverride ?? actionMap[action].icon} ${message}`;
    }
  }
}

/**
 * get the type of a JSON value
 * @param {ValidJson} value
 */
function getValueType(value) {
  if (
    value === undefined ||
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return "primitive";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return "object";
}

/**
 * Convert a JSON value to diff node
 * @param {ValidJson} value
 * @param {DiffChange['action']} [actionOverride]
 * @returns {DiffNode}
 */
function createNodeFromValue(value, actionOverride) {
  const type = getValueType(value);

  if (type === "primitive") {
    return { type: "primitive", value: /** @type {JsonPrimitive} */ (value) };
  }

  if (type === "array") {
    return {
      type: "array",
      items: /** @type {JsonArray} */ (value).map((item) => ({
        action: actionOverride ?? "Default",
        node: createNodeFromValue(item, actionOverride),
      })),
    };
  }

  if (type === "object") {
    /** @type {Record<string, Diff>} */
    const properties = {};
    for (const [key, val] of Object.entries(/** @type {JsonObject} */ (value))) {
      if (val === undefined) continue;
      properties[key] = { action: actionOverride ?? "Default", node: createNodeFromValue(val, actionOverride) };
    }
    return { type: "object", properties };
  }

  throw new Error("unrecognized object type");
}

/**
 * Return whether the change is an update of the same element or a deletion and recreation.
 * If most of the property names are the same, we consider it an update.
 * @param {ValidJson} before
 * @param {ValidJson} after
 * @returns {boolean}
 */
function matchArrayElement(before, after) {
  if (JSON.stringify(before) === JSON.stringify(after)) return true;
  if (getValueType(before) !== getValueType(after)) return false;
  if (getValueType(before) === "primitive") {
    return false;
  }
  if (getValueType(before) === "object") {
    const beforeKeys = new Set(Object.keys(/** @type {JsonObject} */ (before)));
    const afterKeys = new Set(Object.keys(/** @type {JsonObject} */ (after)));
    const allKeys = new Set([...beforeKeys, ...afterKeys]);
    if (allKeys.size === 0) return true; // both empty objects
    const matchingKeys = [...allKeys].filter((key) => beforeKeys.has(key) && afterKeys.has(key));
    if (matchingKeys.length / allKeys.size >= 0.5) return true; // at least half of the keys match
  }
  if (getValueType(before) === "array") {
    const beforeArray = /** @type {JsonArray} */ (before);
    const afterArray = /** @type {JsonArray} */ (after);
    if (beforeArray.length === 0 && afterArray.length === 0) return true; // both empty arrays
    const minLength = Math.min(beforeArray.length, afterArray.length);
    let matchingElements = 0;
    for (let i = 0; i < minLength; i++) {
      if (matchArrayElement(beforeArray[i], afterArray[i])) {
        matchingElements++;
      }
    }
    if (matchingElements / Math.max(beforeArray.length, afterArray.length) >= 0.5) return true; // at least half of the elements match
  }
  return false;
}

/**
 * @param {JsonArray} beforeArray
 * @param {JsonArray} afterArray
 * @returns {Diff}
 */
function buildArrayDiff(beforeArray, afterArray) {
  /** @type {Diff[]} */
  const items = [];

  let beforeIndex = 0;
  let afterIndex = 0;

  while (beforeIndex < beforeArray.length || afterIndex < afterArray.length) {
    const afterItem = afterArray[afterIndex];
    const beforeItem = beforeArray[beforeIndex];

    if (matchArrayElement(beforeItem, afterItem)) {
      if (JSON.stringify(beforeItem) === JSON.stringify(afterItem)) {
        items.push({ action: "Default", node: createNodeFromValue(afterItem) });
      } else if (getValueType(beforeItem) === "object") {
        const objectDiff = buildObjectDiff(
          /** @type {JsonObject} */ (beforeItem),
          /** @type {JsonObject} */ (afterItem),
        );
        items.push(objectDiff);
      } else if (getValueType(beforeItem) === "array") {
        const arrayDiff = buildArrayDiff(/** @type {JsonArray} */ (beforeItem), /** @type {JsonArray} */ (afterItem));
        items.push(arrayDiff);
      }

      beforeIndex++;
      afterIndex++;
      continue;
    }

    const currentBeforeFoundInAfterArray = afterArray
      .slice(afterIndex + 1)
      .some((item) => matchArrayElement(beforeItem, item));
    if (currentBeforeFoundInAfterArray || beforeItem === undefined) {
      items.push({ action: "Add", node: createNodeFromValue(afterItem, "Add") });
      afterIndex++;
      continue;
    }

    const currentAfterFoundInBeforeArray = beforeArray
      .slice(beforeIndex + 1)
      .some((item) => matchArrayElement(item, afterItem));
    if (currentAfterFoundInBeforeArray || afterItem === undefined) {
      items.push({ action: "Remove", node: createNodeFromValue(beforeItem, "Remove") });
      beforeIndex++;
      continue;
    }

    items.push({
      action: "Replace",
      beforeNode: createNodeFromValue(beforeItem, "Remove"),
      afterNode: createNodeFromValue(afterItem, "Add"),
    });
    beforeIndex++;
    afterIndex++;
  }

  return { action: "Default", node: { type: "array", items } };
}

/**
 * @param {JsonObject} beforeObj
 * @param {JsonObject} afterObj
 * @returns {Diff}
 */
function buildObjectDiff(beforeObj, afterObj) {
  /** @type {Record<string, Diff>} */
  const properties = {};
  const allKeys = new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)]);

  for (const key of allKeys) {
    const beforeValue = beforeObj[key];
    const afterValue = afterObj[key];

    if (!(key in beforeObj)) {
      properties[key] = { action: "Add", node: createNodeFromValue(afterValue, "Add") };
    } else if (!(key in afterObj)) {
      properties[key] = { action: "Remove", node: createNodeFromValue(beforeValue, "Remove") };
    } else {
      properties[key] = buildDiff(beforeValue, afterValue);
    }
  }

  return { action: "Default", node: { type: "object", properties } };
}

/**
 * @param {ValidJson} beforeValue
 * @param {ValidJson} afterValue
 * @returns {Diff}
 */
export function buildDiff(beforeValue, afterValue) {
  // Handle null/undefined cases
  if (beforeValue == null && afterValue == null) {
    return { action: "Default", node: { type: "primitive", value: null } };
  }

  if (beforeValue == null) {
    return { action: "Add", node: createNodeFromValue(afterValue, "Add") };
  }

  if (afterValue == null) {
    return { action: "Remove", node: createNodeFromValue(beforeValue, "Remove") };
  }

  const beforeType = getValueType(beforeValue);
  const afterType = getValueType(afterValue);

  if (beforeType !== afterType) {
    return {
      action: "Replace",
      beforeNode: createNodeFromValue(beforeValue, "Remove"),
      afterNode: createNodeFromValue(afterValue, "Add"),
    };
  }

  if (beforeType === "primitive") {
    if (beforeValue === afterValue) {
      return {
        action: "Default",
        node: {
          type: "primitive",
          value: /** @type {JsonPrimitive} */ (afterValue),
        },
      };
    } else {
      return {
        action: "Replace",
        beforeNode: { type: "primitive", value: /** @type {JsonPrimitive} */ (beforeValue) },
        afterNode: { type: "primitive", value: /** @type {JsonPrimitive} */ (afterValue) },
      };
    }
  }

  if (beforeType === "array") {
    return buildArrayDiff(/** @type {JsonArray} */ (beforeValue), /** @type {JsonArray} */ (afterValue));
  }

  if (beforeType === "object") {
    return buildObjectDiff(/** @type {JsonObject} */ (beforeValue), /** @type {JsonObject} */ (afterValue));
  }

  throw new Error("unhandled type");
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
 * @param {Diff} diff
 * @param {LogOptions} options
 * @param {Record<string, string>} changeNotes key: path ('Resource.Properties.BucketName`), value: note to add at that path
 * @param {string} key
 * @param {string} arrayPrefix
 * @param {string} currentPath
 * @returns {Array<string>} lines to log
 */
export function getDiffLines(diff, options, changeNotes = {}, key = "", arrayPrefix = "", currentPath = "") {
  /** @type {Array<string>} */
  let strings = [];
  if (!options.showUnchangedProperties && !hasChanges(diff)) return strings;

  if (diff.action === "Replace") {
    let replacementArrayPrefix = arrayPrefix;
    let replacementIndent = options.indent;
    strings = strings.concat(
      getDiffLines(
        { action: "Remove", node: diff.beforeNode },
        { ...options, indent: replacementIndent },
        changeNotes,
        key,
        replacementArrayPrefix,
        currentPath,
      ),
    );
    // special cases around handling array prefixes with replaced elements
    if (replacementArrayPrefix) {
      // generally, we want to remove all parent array prefixes when replacing array elements
      // if we're logging an object array element with a replaced property, don't log the second array prefix at all
      if (key && diff.beforeNode.type === diff.afterNode.type) {
        replacementIndent += replacementArrayPrefix.length;
        replacementArrayPrefix = "";
      } else {
        replacementIndent += replacementArrayPrefix.length - 2;
        replacementArrayPrefix = "- ";
      }
    }
    strings = strings.concat(
      getDiffLines(
        { action: "Add", node: diff.afterNode },
        { ...options, indent: replacementIndent },
        changeNotes,
        key,
        replacementArrayPrefix,
        currentPath,
      ),
    );
    return strings;
  }

  const indentSpaces = " ".repeat(options.indent);
  const note = currentPath in changeNotes ? ` # ${changeNotes[currentPath]}` : "";

  if (diff.node.type === "primitive") {
    strings = strings.concat(
      Logger.formatDiffString(
        `${indentSpaces}${arrayPrefix}${key ? `${key}: ` : ""}${JSON.stringify(diff.node.value)}${note}`,
        diff.action,
        options,
      ),
    );
    return strings;
  }

  if (diff.node.type === "object") {
    const entries = Object.entries(diff.node.properties);
    if (entries.length === 0) {
      strings.push(
        Logger.formatDiffString(`${indentSpaces}${arrayPrefix}${key ? `${key}: ` : ""}{}${note}`, diff.action, options),
      );
      return strings;
    }
    let parentArrayPrefix = arrayPrefix;
    let propertyIndent = options.indent;
    if (key) {
      strings.push(Logger.formatDiffString(`${indentSpaces}${arrayPrefix}${key}:${note}`, diff.action, options));
      // indent for properties in object
      propertyIndent += 2;
      // indent for array prefix
      propertyIndent += parentArrayPrefix.length;
      parentArrayPrefix = "";
    }
    for (const [propertyKey, propertyDiff] of entries) {
      strings = strings.concat(
        getDiffLines(
          propertyDiff,
          {
            ...options,
            indent: propertyIndent,
          },
          changeNotes,
          propertyKey,
          parentArrayPrefix,
          join(currentPath, propertyKey),
        ),
      );
      propertyIndent += parentArrayPrefix.length;
      parentArrayPrefix = "";
    }
    return strings;
  }

  if (diff.node.type === "array") {
    if (diff.node.items.length === 0) {
      strings.push(
        Logger.formatDiffString(`${indentSpaces}${arrayPrefix}${key ? `${key}: ` : ""}[]${note}`, diff.action, options),
      );
      return strings;
    }
    let parentArrayPrefix = arrayPrefix;
    let itemIndent = options.indent;
    if (key) {
      strings.push(Logger.formatDiffString(`${indentSpaces}${arrayPrefix}${key}:${note}`, diff.action, options));
      // indent for properties in object
      itemIndent += 2;
      // indent for array prefix
      itemIndent += parentArrayPrefix.length;
      parentArrayPrefix = "";
    }
    for (let i = 0; i < diff.node.items.length; i++) {
      strings = strings.concat(
        getDiffLines(
          diff.node.items[i],
          {
            ...options,
            indent: itemIndent,
          },
          changeNotes,
          "",
          `${parentArrayPrefix}- `,
          join(currentPath, String(i + 1)),
        ),
      );
      // clear parent array prefixes for subsequent items
      itemIndent += parentArrayPrefix.length;
      parentArrayPrefix = "";
    }
    return strings;
  }

  return strings;
}

/**
 * @param {ValidJson} before the object before the change
 * @param {ValidJson} after the object after the change
 * @param {object} options
 * @param {boolean} [options.showColor]
 * @param {boolean} [options.showUnchangedProperties]
 * @param {chalk.Chalk} [options.colorOverride]
 * @param {string} [options.iconOverride]
 * @param {Record<string, string>} changeNotes key: path ('Resource.Properties.BucketName`), value: note to add at that path
 */
export function getObjectDiff(before, after, options = {}, changeNotes = {}) {
  const diff = buildDiff(before, after);
  return getDiffLines(
    diff,
    {
      indent: 0,
      showColor: options.showColor ?? true,
      showUnchangedProperties: options.showUnchangedProperties ?? false,
      iconOverride: options.iconOverride,
      colorOverride: options.colorOverride,
    },
    changeNotes,
  );
}
