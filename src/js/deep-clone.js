// @ts-check

/**
 *
 * @param {any} val
 * @returns {any}
 */
function deepClone(val) {
  if (val === null || val === undefined) {
    return val;
  }

  if (val instanceof Date) {
    return new Date(val);
  }

  if (val instanceof RegExp) {
    return new RegExp(val.source, val.flags);
  }

  if (Array.isArray(val)) {
    return val.map((item) => deepClone(item));
  }

  if (typeof val === "object") {
    const /** @type {typeof val} */ clonedObj = {};
    for (const key in val) {
      clonedObj[key] = deepClone(val[key]);
    }
    return clonedObj;
  }

  return val;
}

export default deepClone;
