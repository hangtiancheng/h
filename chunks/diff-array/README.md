# Diff Array

```ts
function getDiffArray(a: number[]): number[] {
  return Array.from({ length: a.length }, (_, i) => {
    if (i === 0) {
      return a[0];
    }
    return a[i] - a[i - 1];
  });
}
```

- 从左到右累加 diffArr 的元素, 可以得到 a
- 以下两个操作是等价的
  - 对 a 的区间 `a[i], a[i + 1], ..., a[j]` 都加 x
  - 对 `diffArr[i]` 加 x, 对 `diffArr[j + 1]` 减 x
