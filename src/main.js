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
