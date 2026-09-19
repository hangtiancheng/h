/**
 * @param {Array} arr
 * @return {(string | number | boolean | null)[][]}
 */
function jsonToMatrix(arr) {
  let paths = new Set();
  let ans = Array.from({ length: arr.length }, () => ({}));
  const dfs = (path, el, ansIdx) => {
    if (typeof el !== "object" || el === null) {
      path = path.slice(1);
      ans[ansIdx][path] = el;
      paths.add(path);
      return;
    }
    if (Array.isArray(el)) {
      el.forEach((item, idx) => {
        dfs(`${path}.${idx}`, item, ansIdx);
      });
    } else {
      const keys = Object.keys(el);
      keys.forEach((key) => {
        dfs(`${path}.${key}`, el[key], ansIdx);
      });
    }
  };
  arr.forEach((item, idx) => dfs("", item, idx));
  paths = Array.from(paths);
  paths.sort();
  // console.log(ans)
  ans = ans.map((item) => {
    const keys = new Set(Object.keys(item));
    const newItem = new Array(paths.length);
    for (let i = 0; i < paths.length; i++) {
      if (keys.has(paths[i])) {
        newItem[i] = item[paths[i]];
      } else {
        newItem[i] = "";
      }
    }
    return newItem;
  });
  return [paths, ...ans];
}

console.log(jsonToMatrix([{ a: { b: 1, c: 2 } }, { a: { b: 3, d: 4 } }]));
console.log(jsonToMatrix([{}, {}, {}]));
