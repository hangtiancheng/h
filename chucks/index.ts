function generateParenthesis(n: number): string[] {
  const ans: string[] = [];
  const dfs = (left: number, right: number, path: string) => {
    if (right === n) {
      ans.push(path);
      return;
    }
    if (left < n) {
      dfs(left + 1, right, path + "(");
    }
    if (right < left) {
      dfs(left, right + 1, path + ")");
    }
  };
  dfs(0, 0, "");
  return ans;
}

function isValid(s: string): boolean {
  const stack: string[] = [];
  for (const ch of s) {
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(ch);
      continue;
    }
    if (stack.length > 0 && ch === stack[stack.length - 1]) {
      stack.pop();
      continue;
    } else {
      return false;
    }
  }
  return stack.length === 0;
}
