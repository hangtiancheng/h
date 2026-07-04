export function topologicalSort(
  numCourses: number,
  prerequisites: number[][],
): number[] {
  const inDegree = new Array<number>(numCourses).fill(0);
  const graph: number[][] = Array.from({ length: numCourses }, () => []);

  for (const [course, pre] of prerequisites) {
    graph[pre].push(course);
    inDegree[course]++;
  }

  const queue: number[] = [];
  for (let course = 0; course < numCourses; course++) {
    if (inDegree[course] === 0) {
      queue.push(course);
    }
  }

  const order: number[] = [];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head++;
    order.push(current);

    for (const next of graph[current]) {
      inDegree[next]--;
      if (inDegree[next] === 0) {
        queue.push(next);
      }
    }
  }

  return order.length === numCourses ? order : [];
}

export default topologicalSort;
