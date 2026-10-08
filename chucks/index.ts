export function solve(tasks: number[][], cooldown: number): number {
  const maxStartTime = Math.max(...tasks.map((item) => item[0]));

  const dfs = (currentTime: number, done: Set<number>): number => {
    if (currentTime > maxStartTime || done.size === tasks.length) {
      return 0;
    }

    let ret = 0;
    for (let i = 0; i < tasks.length; i++) {
      if (done.has(i)) {
        continue;
      }
      const [start, end, value] = tasks[i];
      if (start >= currentTime) {
        done.add(i);
        ret = Math.max(ret, value + dfs(end + cooldown, done));
        done.delete(i);
      }
    }
    return ret;
  };

  return dfs(0, new Set<number>());
}
