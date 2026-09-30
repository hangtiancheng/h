/**
 * @param {null | boolean | number | string | Array | Object} obj
 * @return {string}
 */
function jsonStringify(obj) {
  if (typeof obj === "string") {
    return `"${obj}"`;
  }
  if (typeof obj !== "object" || obj === null) {
    // String(null) => 'null'
    // new String(null) => [String: 'null']
    return String(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((item) => jsonStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(obj);
  const kvsStr = entries
    .map(([k, v]) => `"${k}": ${jsonStringify(v)}`)
    .join(",");
  return `{${kvsStr}}`;
}

console.log(jsonStringify([1, 2, 3]));
console.log(JSON.stringify([1, 2, 3]));
console.log(jsonStringify({ a: 1, b: 2 }));
console.log(JSON.stringify({ a: 1, b: 2 }));
