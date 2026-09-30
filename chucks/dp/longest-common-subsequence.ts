function longestCommonSubsequence(text1: string, text2: string): number {
  const f = Array.from({ length: text1.length + 1 }, () =>
    new Array<number>(text2.length + 1).fill(0),
  );
  for (let i = 1; i <= text1.length; i++) {
    for (let j = 1; j <= text2.length; j++) {
      if (text1[i - 1] === text2[j - 1]) {
        f[i][j] = f[i - 1][j - 1] + 1;
      } else {
        f[i][j] = Math.max(f[i - 1][j], f[i][j - 1]);
      }
    }
  }
  let ans = "";
  for (let i = 1; i <= text1.length; i++) {
    for (let j = 1; j <= text2.length; j++) {
      if (
        f[i][j] === f[i - 1][j - 1] + 1 &&
        f[i][j] > f[i - 1][j] &&
        f[i][j] > f[i][j - 1]
      ) {
        ans += text1[i - 1];
      }
    }
  }
  console.log(ans);
  return f[text1.length][text2.length];
}

export default longestCommonSubsequence;
