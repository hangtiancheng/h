const isObject = (obj) => typeof obj === "object" && obj !== null;
/**
 * @param {Object | Array} obj1
 * @param {Object | Array} obj2
 * @return {Object | Array}
 */
function objDiff(obj1, obj2) {
  const dfs = (obj1, obj2, diff = {}) => {
    if (!isObject(obj1) || !isObject(obj2)) {
      if (obj1 === obj2) {
        return {};
      }
      return [obj1, obj2];
    }
    if (
      (Array.isArray(obj1) && !Array.isArray(obj2)) ||
      (Array.isArray(obj2) && !Array.isArray(obj1))
    ) {
      return [obj1, obj2];
    }
    const keys1 = Object.keys(obj1);
    const keys2 = new Set(Object.keys(obj2));
    for (const k of keys1) {
      if (keys2.has(k)) {
        const subDiff = dfs(obj1[k], obj2[k], diff[k]);
        if (Object.keys(subDiff).length > 0) {
          diff[k] = subDiff;
        }
      }
    }
    return diff;
  };
  return dfs(obj1, obj2);
}

console.log(
  objDiff(
    { a: 1, v: 3, x: [], z: { a: null } },
    { a: 2, v: 4, x: [], z: { a: 2 } },
  ),
);

function objDiff2(obj1, obj2) {
  if (!isObject(obj1) || !isObject(obj2)) {
    if (obj1 === obj2) {
      return {};
    }
    return [obj1, obj2];
  }
  if (
    (Array.isArray(obj1) && !Array.isArray(obj2)) ||
    (Array.isArray(obj2) && !Array.isArray(obj1))
  ) {
    return [obj1, obj2];
  }
  const res = {};
  for (const key in obj1) {
    if (key in obj2) {
      const subDiff = objDiff2(obj1[key], obj2[key]);
      if (Object.keys(subDiff).length > 0) {
        res[key] = subDiff;
      }
    }
  }
  return res;
}

console.log(
  objDiff2(
    { a: 1, v: 3, x: [], z: { a: null } },
    { a: 2, v: 4, x: [], z: { a: 2 } },
  ),
);
