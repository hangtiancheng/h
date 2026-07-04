const isObject = (val) => typeof val === "object" && val !== null;

/**
 * @param {null |boolean | number | string | Array | Object} obj1
 * @param {null |boolean | number | string | Array | Object} obj2
 * @return {null |boolean | number | string | Array | Object}
 */
function deepMerge(obj1, obj2) {
  if (
    !isObject(obj1) ||
    !isObject(obj2) ||
    (Array.isArray(obj1) && !Array.isArray(obj2)) ||
    (Array.isArray(obj2) && !Array.isArray(obj1))
  ) {
    if (obj2 === undefined) {
      return obj1;
    }
    return obj2;
  }
  const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
  const res = Array.isArray(obj1) && Array.isArray(obj2) ? [] : {};
  for (const key of allKeys) {
    res[key] = deepMerge(
      key in obj1 ? obj1[key] : undefined,
      key in obj2 ? obj2[key] : undefined,
    );
  }
  return res;
}

deepMerge(
  { a: { b: { c: { d: { e: { f: "g" } } } } } },
  { a: { b: { d: { e: { f: { g: "h" } } } } } },
);
