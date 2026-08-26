function shortestBeautifulSubstring(s: string, k: number): string {
  const loc: number[] = [];

  for (let i = 0; i < s.length; i++) {
    if (s[i] === "1") {
      loc.push(i);
    }
  }

  const n = loc.length;
  if (n < k) {
    return "";
  }
  let len = s.length;
  let ans = "";
  for (let i = 0; i + k <= n; i++) {
    const l = loc[i];
    const r = loc[i + k - 1];
    const len2 = r - l + 1;
    const cur = s.slice(l, r + 1);
    if (len === len2) {
      ans = ans === "" ? cur : cur < ans ? cur : ans;
      continue;
    }
    if (len2 < len) {
      len = len2;
      ans = cur;
    }
  }

  return ans;
}
