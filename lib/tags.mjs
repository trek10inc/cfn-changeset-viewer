/**
 * @typedef {{ Key?: string, Value?: string }} Tag
 */

/**
 * Filter hidden stack tags out of a changeset's before/after tag sets.
 *
 * CloudFormation reports a stack-tag change in two shapes:
 *   - whole-array: the tag entry carries its `Key` directly (tag add), or
 *   - per-field: when only a tag's value changes, CloudFormation omits the `Key`.
 * For the per-field value-only case we recover the missing key from the
 * changeset's stack-level `Tags` list (`Value -> Key`).
 *
 * A tag is matched by index position, so a hidden tag is removed from both the
 * before and after sets even when only one side exposes a resolvable key.
 *
 * @param {*} beforeTags   beforeStackTags.Tags container (array | index-keyed object | undefined)
 * @param {*} afterTags    afterStackTags.Tags container (array | index-keyed object | undefined)
 * @param {string[]} hideTagNames tag keys to hide
 * @param {Tag[]} stackTags changeset-level Tags, used to recover keys for value-only changes
 * @returns {{ before: any[], after: any[] }} filtered tag value arrays
 */
export function getVisibleStackTags(beforeTags, afterTags, hideTagNames, stackTags) {
  const beforeValues = beforeTags ? Object.values(beforeTags) : [];
  const afterValues = afterTags ? Object.values(afterTags) : [];

  if (!hideTagNames || hideTagNames.length === 0) {
    return { before: beforeValues, after: afterValues };
  }

  const hide = new Set(hideTagNames);

  // value -> key, for recovering the key of a value-only tag change
  /** @type {Map<string, string>} */
  const valueToKey = new Map();
  for (const tag of stackTags ?? []) {
    if (tag.Key !== undefined && tag.Value !== undefined) {
      valueToKey.set(tag.Value, tag.Key);
    }
  }

  /** @param {*} entry */
  const resolveName = (entry) => {
    if (entry?.Key !== undefined) return entry.Key;
    if (entry?.Value !== undefined) return valueToKey.get(entry.Value);
    return undefined;
  };

  // Collect the index keys to hide, unioned across before + after so a
  // value-only change (resolvable only on the after side) still removes the
  // matching before-side entry at the same index.
  const hiddenIndices = new Set();
  for (const container of [beforeTags, afterTags]) {
    if (!container) continue;
    for (const [index, entry] of Object.entries(container)) {
      const name = resolveName(entry);
      if (name !== undefined && hide.has(name)) hiddenIndices.add(index);
    }
  }

  /** @param {*} container */
  const filter = (container) =>
    container ? Object.entries(container).filter(([index]) => !hiddenIndices.has(index)).map(([, value]) => value) : [];

  return { before: filter(beforeTags), after: filter(afterTags) };
}

/**
 * Recursively remove tags whose Key matches from any "Tags" array in a resource
 * tree, mutating it in place. Covers resource-property tags (e.g. Properties.Tags
 * and nested TagSpecifications[].Tags), which — unlike stack tags — always carry
 * their Key, so no key recovery is needed.
 *
 * @param {*} node the parsed resource before/after context
 * @param {Set<string>} hideTagNames tag keys to hide
 */
export function stripHiddenPropertyTags(node, hideTagNames) {
  if (Array.isArray(node)) {
    for (const item of node) stripHiddenPropertyTags(item, hideTagNames);
    return;
  }
  if (node === null || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "Tags" && Array.isArray(value)) {
      node[key] = value.filter((tag) => !(tag && typeof tag === "object" && hideTagNames.has(tag.Key)));
    }
    stripHiddenPropertyTags(value, hideTagNames);
  }
}
