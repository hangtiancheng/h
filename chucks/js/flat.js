Array.prototype.flat2 = function (depth = 1) {
  if (this.length === 0) {
    return [];
  }
  if (depth > 0) {
    return this.reduce((acc, val) => {
      // return acc.concat(Array.isArray(val) ? this.flat(depth - 1) : val)
      if (Array.isArray(val)) {
        return acc.concat(val.flat(depth - 1));
      } else {
        return acc.concat(val);
      }

      // if (Array.isArray(val)) {
      //   return [...acc, ...val.flat(depth - 1)];
      // } else {
      //   return [...acc, val];
      // }
    }, []);
  } else {
    // depth === 0
    return this.slice(); // return [...this]
  }
};

Array.prototype.flat3 = function (depth = 1) {
  if (this.length === 0) {
    return [];
  }
  const res = [];

  const dfs = (arr, depth) => {
    for (const item of arr) {
      if (Array.isArray(item) && depth > 0) {
        dfs(item, depth - 1);
      } else {
        res.push(item);
      }
    }
  };

  dfs(this, depth);
  return res;
};

const arr = [1, 2, [3, 4, [5, 6, [7, 8, 9]]]];
console.log(arr.flat(1));
console.log(arr.flat(1));
console.log(arr.flat(1));

console.log(arr.flat(2));
console.log(arr.flat(2));
console.log(arr.flat(2));

console.log(arr.flat(Infinity));
console.log(arr.flat(Infinity));
console.log(arr.flat(Infinity));
