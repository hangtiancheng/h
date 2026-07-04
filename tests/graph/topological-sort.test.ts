import { describe, expect, it } from "vitest";

import { topologicalSort } from "@/graph/topological-sort.js";

function isValidTopologicalOrder(
  numCourses: number,
  prerequisites: number[][],
  order: number[],
): boolean {
  if (order.length !== numCourses) {
    return false;
  }

  const position = new Array<number>(numCourses).fill(-1);
  order.forEach((course, index) => {
    position[course] = index;
  });

  for (const [course, pre] of prerequisites) {
    if (position[pre] >= position[course]) {
      return false;
    }
  }

  return true;
}

describe("topologicalSort", () => {
  it("returns a valid order for a DAG", () => {
    const numCourses = 4;
    const prerequisites = [
      [1, 0],
      [2, 0],
      [3, 1],
      [3, 2],
    ];

    const order = topologicalSort(numCourses, prerequisites);

    expect(isValidTopologicalOrder(numCourses, prerequisites, order)).toBe(
      true,
    );
  });

  it("returns all courses when there are no prerequisites", () => {
    expect(topologicalSort(3, [])).toEqual([0, 1, 2]);
  });

  it("returns an empty array when the graph contains a cycle", () => {
    const prerequisites = [
      [0, 1],
      [1, 2],
      [2, 0],
    ];

    expect(topologicalSort(3, prerequisites)).toEqual([]);
  });

  it("handles multiple prerequisites for the same course", () => {
    const numCourses = 5;
    const prerequisites = [
      [2, 0],
      [2, 1],
      [3, 1],
      [4, 2],
      [4, 3],
    ];

    const order = topologicalSort(numCourses, prerequisites);

    expect(isValidTopologicalOrder(numCourses, prerequisites, order)).toBe(
      true,
    );
  });
});
