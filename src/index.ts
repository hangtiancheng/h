function minMoves(classroom: string[], energy: number): number {
  let target = 0;

  const grid = classroom.map((item) => {
    const line = Array.from(item);
    for (const item of line) {
      if (item === "L") {
        target++;
      }
    }
    return line;
  });

  let ans = Infinity;
  const next = [
    [-1, 0],
    [0, 1],
    [1, 0],
    [0, -1],
  ];

  const dfs = (
    x: number,
    y: number,
    count: number,
    curSteps: number,
    curEnergy: number,
  ) => {
    if (count === target) {
      ans = Math.min(ans, curSteps);
      return;
    }
    if (grid[x][y] !== "R" && curEnergy === 0) {
      return;
    }
    if (grid[x][y] === "R") {
      curEnergy = energy;
    }
    const xyL = grid[x][y] === "L";
    for (const [dx, dy] of next) {
      const x2 = x + dx;
      const y2 = y + dy;
      if (
        x2 >= 0 &&
        x2 < grid.length &&
        y2 >= 0 &&
        y2 < grid[0].length &&
        grid[x2][y2] !== "X"
      ) {
        if (xyL) {
          grid[x2][y2] = ".";
        }
        dfs(x2, y2, count + (xyL ? 1 : 0), curSteps + 1, curEnergy - 1);
        if (xyL) {
          grid[x2][y2] = "L";
        }
      }
    }
  };

  dfs(0, 0, 0, 0, energy);
  return Number.isFinite(ans) ? ans : -1;
}

const ans = minMoves(["S.", "XL"], 2);
console.log(ans);
