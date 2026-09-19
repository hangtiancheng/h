export function countBits(n: number) {
  let cnt = 0;
  n = n >>> 0; // to uint32
  while (n !== 0) {
    n = n & (n - 1);
    cnt++;
  }
  return cnt;
}
