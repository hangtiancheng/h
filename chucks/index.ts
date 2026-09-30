function lexGreaterPermutation(s: string, target: string): string {
  const aCharCode = "a".charCodeAt(0);

  const left = new Array<number>(26).fill(0);
  for (let i = 0; i < s.length; i++) {
    left[s.charCodeAt(i) - aCharCode]++;
    left[target.charCodeAt(i) - aCharCode]--;
  }

  tag: for (let i = s.length - 1; i >= 0; i--) {
    const b = target.charCodeAt(i) - aCharCode;
    left[b]++;
    for (const c of left) {
      if (c < 0) {
        continue tag;
      }
    }

    for (let j = b + 1; j < 26; j++) {
      if (left[j] === 0) {
        continue;
      }
      left[j]--;
      const ans = Array.from(target.slice(0, i + 1));
      ans[i] = String.fromCharCode(aCharCode + j);
      for (let k = 0; k < left.length; k++) {
        const c = left[k];
        const ch = String.fromCharCode(aCharCode + k);
        ans.push(Array.from({ length: c }, () => ch).join(""));
      }
      return ans.join("");
    }
  }
  return "";
}
