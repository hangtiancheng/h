function gcdIterative(a: number, b: number): number {
  if (a < b) {
    const temp = a;
    a = b;
    b = temp;
  }
  while (b !== 0) {
    const temp = a % b;
    a = b;
    b = temp;
  }
  return a;
}

function gcdRecursive(a: number, b: number): number {
  if (b === 0) {
    return a;
  }
  return gcdRecursive(b, a % b);
}

function lcmCustom(a: number, b: number): number {
  const ret = Math.floor((a * b) / gcdIterative(a, b));
  // Not checking exact equality with built-in LCM here as JS lacks it in Math.
  return ret;
}
