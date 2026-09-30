/**
 * @param {string} s
 * @param {string} target
 * @return {string}
 */
var lexGreaterPermutation = function (s, target) {
  let ans = "";
  const n = s.length;
  const used = Array.from({ length: n }, () => false);

  /**
   *
   * @param {string} a
   * @param {string} b
   */
  const prefixCompare = (a, b) => {
    const len = Math.min(a.length, b.length);
    return a.slice(0, len).localeCompare(b.slice(0, len));
  };

  /**
   *
   * @param {string} item
   */
  const dfs = (item) => {
    if (prefixCompare(item, ans) > 0) {
      return;
    }
    if (item.length === n) {
      if (item.localeCompare(target) > 0) {
        if (ans === "" || item.localeCompare(ans) < 0) {
          ans = item;
          return;
        }
      }
    }

    for (let i = 0; i < n; i++) {
      if (!used[i]) {
        used[i] = true;

        dfs(item + s[i]);

        used[i] = false;
      }
    }
  };

  dfs("");

  return ans;
};

/**
 *
 * @param {unknown} a
 * @returns {string | NaN}
 */
const maybeNumber = (a) => {
  if (typeof a === "number") {
    return !Number.isNaN(a) ? String(a) : NaN;
  }
  if (typeof a === "bigint") {
    return String(a);
  }
  if (typeof a === "string") {
    for (let i = 0; i < a.length; i++) {
      if (a.charCodeAt(i) < "0" || a.charCodeAt(i) > "9") {
        return NaN;
      }
    }
    return a.replace(/^0+/, "") || "0";
  }
  return NaN;
};

/**
 *
 * @param {string} a
 * @param {string} b
 * @returns {string}
 */
function multiple(a, b) {
  a = a.replace(/^0+/, "") || "0";
  b = b.replace(/^0+/, "") || "0";
  if (a === "0" || b === "0") {
    return "0";
  }

  const charCode0 = "0".charCodeAt(0);
  const ansArr = Array.from({ length: a.length + b.length }, () => 0);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      const aItem = a.charCodeAt(i) - charCode0;
      const bItem = b.charCodeAt(j) - charCode0;

      const mul = aItem * bItem + ansArr[i + j + 1];
      ansArr[i + j + 1] = mul % 10;
      ansArr[i + j] += Math.floor(mul / 10);
    }
  }
  const ans = ansArr.join("").replace(/^0+/, "");
  return ans;
}

const a = multiple("12", "34");
const b = 12 * 34;
console.log(a, b);
