// @ts-check

const dir4 = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/**
 * @param {number[][]} grid
 * @param {number} health
 * @return {boolean}
 */
var findSafeWalk = function (grid, health) {
  const m = grid.length,
    n = grid[0].length;

  const cost = Array.from({ length: m }, () =>
    Array.from({ length: n }, () => -1),
  );
  cost[0][0] = grid[0][0];

  /**
   * @type {[x: number, y: number][]}
   */
  let q = [[0, 0]];
  let ans = false;

  while (q.length) {
    const tmp = q;
    q = [];

    while (tmp.length) {
      const top = tmp.shift();

      if (top) {
        const [tx, ty] = top;
        const tc = cost[tx][ty];
        if (tx === m - 1 && ty === n - 1) {
          ans = true;
          break;
        }

        for (const [dx, dy] of dir4) {
          const x = tx + dx,
            y = ty + dy;
          if (x >= 0 && x < m && y >= 0 && y < n) {
            const nc = tc + grid[x][y];
            if ((cost[x][y] === -1 && nc < health) || nc < cost[x][y]) {
              cost[x][y] = nc;
              q.push([x, y]);
            }
          }
        }
      }
    }
  }

  return ans;
};
