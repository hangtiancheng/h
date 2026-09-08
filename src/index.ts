function lexGreaterPermutation(s: string, target: string): string {
  const used = Array.from({ length: s.length }, () => false);
  let ans = "";

  const prefixCompare = (a: string, b: string) => {
    const len = Math.min(a.length, b.length);
    return a.slice(0, len).localeCompare(b.slice(0, len));
  };
  const dfs = (cur: string) => {
    if (ans !== "") {
      if (prefixCompare(cur, ans) > 0) {
        return;
      }
    }

    if (cur.length === target.length) {
      if (cur.localeCompare(target) > 0) {
        if (ans === "" || cur.localeCompare(ans) < 0) {
          ans = cur;
        }
      }
      return;
    }

    for (let i = 0; i < s.length; i++) {
      if (used[i]) {
        continue;
      }
      used[i] = true;
      dfs(cur + s[i]);
      used[i] = false;
    }
  };

  dfs("");
  return ans;
}
