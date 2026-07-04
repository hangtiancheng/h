import { createInterface } from "readline";

const rl = createInterface({
  input: process.stdin,
});

const iter = rl[Symbol.asyncIterator]();
const input = async () => String((await iter.next()).value);

(async () => {
  const T = Number.parseInt(await input());
  for (let i = 0; i < T; i++) {
    const [n, x] = (await input())
      .split(" ")
      .map((item) => Number.parseInt(item));
    const graph = new Map<number, Set<number>>();
    const degrees = new Array<number>(n + 1).fill(0);
    for (let j = 0; j < n; j++) {
      const [u, v] = (await input())
        .split(" ")
        .map((item) => Number.parseInt(item));
      if (graph.has(u)) {
        graph.get(u)?.add(v);
      } else {
        graph.set(u, new Set([v]));
      }
      if (graph.has(v)) {
        graph.get(v)?.add(u);
      } else {
        graph.set(v, new Set([u]));
      }
      degrees[u]++;
      degrees[v]++;
    } // Setup graph

    let loop = 0;
    tag: for (; degrees[x] > 0; loop++) {
      const neighbors = graph.get(x)!;
      for (const neighbor of neighbors) {
        if (degrees[neighbor] === 1) {
          degrees[neighbor] = 0;
          degrees[x]--;
          graph.delete(neighbor);
          neighbors.delete(neighbor);
          continue tag;
        }
      }
      for (let k = 0; k < degrees.length; k++) {
        if (degrees[k] === 1) {
          const k2 = Array.from(graph.get(k)!)[0];
          degrees[k] = 0;
          degrees[k2] = 0;
          graph.delete(k);
          graph.delete(k2);
          continue tag;
        }
      }
      break tag;
    }
    if (degrees[x] === 0) {
      console.log(loop % 2 === 1 ? "Xiaoyo" : "Pyrmont");
    } else {
      console.log("Draw");
    }
  }
  rl.close();
})();
