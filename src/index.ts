// Let dis[i][j] be the Manhattan distance from cell (i, j) to the nearest 1.
// The safeness factor is the minimum dis[i][j] along a path from (0, 0) to (n-1, n-1).
// Enumerate the safeness factor from largest to smallest. Suppose the safeness factor is d:
// use a Union-Find to connect every cell with dis[i][j] >= d to its adjacent cells that also
// have dis >= d. If (0, 0) and (n-1, n-1) become connected, then the answer is d.
//
// In terms of implementation, there is no need to traverse the entire dis array for each d.
// Instead, incrementally connect cells whose dis[i][j] is exactly d to their adjacent cells
// with dis >= d. Cells sharing the same dis value can be grouped together (stored in `groups`)
// to avoid repeatedly scanning the full dis array.
//
// To compute dis, run a multi-source BFS starting from all cells containing 1.

function maximumSafenessFactor(grid: number[][]): number {
  const n = grid.length;
  const dis = Array.from({ length: n }, () =>
    Array.from({ length: n }, () => 0),
  );
  let ps: [x: number, y: number][] = [];

  for (let i = 0; i < grid.length; i++) {
    const row = grid[i];
    for (let j = 0; j < row.length; j++) {
      const x = row[j];
      if (x === 1) {
        // A thief
        ps.push([i, j]);
      } else {
        dis[i][j] = -1; // Not a thief
      }
    }
  }

  const groups: (typeof ps)[] = [ps];

  while (ps.length > 0) {
    const tmp = [...ps];
    ps = [];
    for (const t of tmp) {
      for (const [dx, dy] of dir4) {
        const [x, y] = [t[0] + dx, t[1] + dy];
        if (x >= 0 && x < n && y >= 0 && y < n && dis[x][y] === -1) {
          dis[x][y] = groups.length;
          ps.push([x, y]);
        }
      }
    }
    groups.push(ps);
  }

  const fa = Array.from({ length: n * n }, (_v, k) => k);
  const find = (x: number): number => {
    if (fa[x] !== x) {
      fa[x] = find(fa[x]);
    }
    return fa[x];
  };

  const union = (x: number, y: number) => {
    const fx = find(x);
    const fy = find(y);
    fa[fx] = fy;
  };

  for (let ans = groups.length - 2; ans > 0; ans--) {
    for (const g of groups[ans]) {
      const [i, j] = g;
      for (const [dx, dy] of dir4) {
        const [x, y] = [i + dx, j + dy];
        if (x >= 0 && x < n && y >= 0 && y < n && dis[x][y] >= ans) {
          union(x * n + y, i * n + j);
        }
      }
    }

    if (find(0) === find(n * n - 1)) {
      return ans;
    }
  }

  return 0;
}

const dir4: [dx: number, dy: number][] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];
function findSafeWalk(grid: number[][], health: number): boolean {
  const m = grid.length,
    n = grid[0].length;

  const vis = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => false),
  );

  vis[0][0] = true;

  const least = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => Infinity),
  );

  const dfs = (i: number, j: number, cost: number): number => {
    if (cost >= health) return Infinity;
    if (cost >= least[i][j]) return Infinity;
    least[i][j] = cost;

    if (i === m - 1 && j === n - 1) {
      return cost + grid[i][j];
    }

    vis[i][j] = true;

    let ret = Infinity;
    for (const [dx, dy] of dir4) {
      const x = i + dx,
        y = j + dy;
      if (x >= 0 && x < m && y >= 0 && y < n && !vis[x][y]) {
        ret = Math.min(ret, dfs(x, y, cost + grid[i][j]));
      }
    }

    vis[i][j] = false;
    return ret;
  };

  return dfs(0, 0, 0) < health;
}

const res = findSafeWalk(
  [
    [0, 1, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 1, 0],
  ],
  1,
);

console.log(res); // Should be true

const res2 = findSafeWalk(
  [
    [0, 1, 1, 0, 0, 0],
    [1, 0, 1, 0, 0, 0],
    [0, 1, 1, 1, 0, 1],
    [0, 0, 1, 0, 1, 0],
  ],
  3,
);

console.log(res2); // Should be false

function pivotArray(nums: number[], pivot: number): number[] {
  const sNums: number[] = [];
  const lNums: number[] = [];
  let repeat = 0;
  for (const n of nums) {
    if (n < pivot) {
      sNums.push(n);
      continue;
    }
    if (n > pivot) {
      lNums.push(n);
      continue;
    }
    repeat++;
  }
  return [...sNums, ...new Array<number>(repeat).fill(pivot), ...lNums];
}
