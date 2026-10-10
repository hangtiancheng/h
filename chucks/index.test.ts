import assert from "node:assert/strict";
import { test } from "node:test";

import { solve } from "./index.ts";

interface Case {
  name: string;
  tasks: number[][];
  cooldown: number;
  expected: number;
}

const cases: Case[] = [
  {
    name: "empty task list returns 0",
    tasks: [],
    cooldown: 0,
    expected: 0,
  },
  {
    name: "single task",
    tasks: [[2, 5, 7]],
    cooldown: 3,
    expected: 7,
  },
  {
    name: "non-overlapping tasks can all be taken",
    tasks: [
      [0, 1, 10],
      [5, 6, 100],
    ],
    cooldown: 0,
    expected: 110,
  },
  {
    name: "regression: task starting exactly at max start must not be pruned",
    tasks: [
      [0, 0, 1],
      [5, 6, 100],
    ],
    cooldown: 5,
    expected: 101,
  },
  {
    name: "regression: cooldown chain reaching the last start time",
    tasks: [
      [1, 2, 4],
      [3, 5, 6],
      [2, 3, 5],
    ],
    cooldown: 1,
    expected: 10,
  },
  {
    name: "overlapping tasks cannot both be taken",
    tasks: [
      [0, 5, 10],
      [3, 8, 20],
    ],
    cooldown: 0,
    expected: 20,
  },
  {
    name: "cooldown forces a gap, dropping the greedy middle task",
    tasks: [
      [1, 2, 4],
      [3, 5, 6],
      [2, 3, 5],
    ],
    cooldown: 2,
    expected: 6,
  },
  {
    name: "zero-duration tasks with cooldown",
    tasks: [
      [0, 0, 3],
      [1, 1, 4],
      [2, 2, 5],
    ],
    cooldown: 1,
    expected: 12,
  },
  {
    name: "one high-value long task beats a chain of small ones",
    tasks: [
      [0, 10, 200],
      [0, 2, 30],
      [2, 4, 30],
      [4, 6, 30],
      [6, 8, 30],
    ],
    cooldown: 0,
    expected: 200,
  },
  {
    name: "a chain of small tasks beats one long task",
    tasks: [
      [0, 10, 100],
      [0, 2, 30],
      [2, 4, 30],
      [4, 6, 30],
      [6, 8, 30],
    ],
    cooldown: 0,
    expected: 120,
  },
  {
    name: "different start order still explored",
    tasks: [
      [0, 1, 9],
      [2, 2, 3],
      [6, 9, 1],
      [3, 5, 5],
    ],
    cooldown: 1,
    expected: 18,
  },
];

for (const { name, tasks, cooldown, expected } of cases) {
  test(name, () => {
    assert.equal(solve(tasks, cooldown), expected);
  });
}

const reference = (tasks: number[][], cooldown: number): number => {
  const sorted = [...tasks].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const dp = new Array<number>(sorted.length + 1).fill(0);
  for (let i = 1; i <= sorted.length; i++) {
    const [start, , value] = sorted[i - 1];
    let best = 0;
    for (let k = i - 1; k >= 1; k--) {
      if (sorted[k - 1][1] <= start - cooldown) {
        best = dp[k];
        break;
      }
    }
    dp[i] = Math.max(dp[i - 1], value + best);
  }
  return dp[sorted.length];
};

const mulberry32 = (seed: number): (() => number) => {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

test("randomized differential test against weighted-interval DP", () => {
  const random = mulberry32(20261008);
  for (let iter = 0; iter < 2000; iter++) {
    const count = 1 + Math.floor(random() * 7);
    const tasks: number[][] = [];
    for (let i = 0; i < count; i++) {
      const start = Math.floor(random() * 8);
      const end = start + Math.floor(random() * 4);
      const value = 1 + Math.floor(random() * 10);
      tasks.push([start, end, value]);
    }
    const cooldown = Math.floor(random() * 3);
    assert.equal(
      solve(tasks, cooldown),
      reference(tasks, cooldown),
      `mismatch for ${JSON.stringify(tasks)} with cooldown ${cooldown}`,
    );
  }
});
