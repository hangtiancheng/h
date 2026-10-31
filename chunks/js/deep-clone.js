// @ts-check

function deepClone(obj, seen = new WeakMap()) {
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  if (seen.has(obj)) {
    return seen.get(obj);
  }

  let clone;

  if (obj instanceof Date) {
    clone = new Date(obj);
    seen.set(obj, clone);
    return clone;
  }

  if (obj instanceof RegExp) {
    clone = new RegExp(obj.source, obj.flags);
    clone.lastIndex = obj.lastIndex;
    seen.set(obj, clone);
    return clone;
  }

  clone = Array.isArray(obj) ? [] : {};
  seen.set(obj, clone);

  for (const key in obj) {
    // eslint-disable-next-line no-prototype-builtins
    if (obj.hasOwnProperty(key)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clone[key] = deepClone(obj[key], seen);
    }
  }

  return clone;
}

export default deepClone;
