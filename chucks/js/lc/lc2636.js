/**
 * @param {Function[]} funcs
 * @param {number} n
 * @return {Promise<any>}
 */
function promisePool(funcs, n) {
  const mapFn = (f) =>
    async function (...args) {
      await f(...args);
      if (pendingQueue.length > 0) {
        await pendingQueue.shift()();
      }
    };
  let pendingQueue = funcs.slice(n).map(mapFn);
  const workQueue = funcs.slice(0, n).map(mapFn);
  return Promise.all(workQueue.map((f) => f()));
}

/**
 * @param {Function[]} funcs
 * @param {number} n
 * @return {Promise<any>}
 */
function promisePool2(funcs, n) {
  const resArr = [];
  const iter /** ArrayIterator<[number, Function]> */ = funcs.entries();
  const work = async (iter) => {
    for (const [idx, task] of iter) {
      const res = await task();
      resArr[idx] = res;
    }

    // let item;
    // while (!(item = iter.next()).done) {
    //   const [idx, task] = item.value;
    //   const res = await task();
    //   resArr[idx] = res;
    // }
  };
  const workers = new Array(n).fill(iter).map(work);
  return Promise.all(workers).then(() => resArr);
}

/**
 * @param {Function[]} funcs
 * @param {number} n
 * @return {Promise<any>}
 */
function promisePool3(funcs, n) {
  const resArr = [];
  let idx = 0;
  const run = async () => {
    while (idx < funcs.length) {
      const curIdx = idx++;
      resArr[curIdx] = await funcs[curIdx]();
    }
  };
  const workers = new Array(n).fill().map(run);
  return Promise.all(workers).then(() => resArr);
}

/**
 * @param {Function[]} funcs
 * @param {number} n
 * @return {Promise<any>}
 */
async function promisePool4(funcs, n) {
  const workQueue = new Set();
  const resArr = [];
  for (const task of funcs) {
    const p = task().then((res) => {
      resArr.push(res);
      workQueue.delete(p);
    });
    workQueue.add(p);
    if (workQueue.size >= n) {
      await Promise.race(workQueue);
    }
  }
  await Promise.allSettled(workQueue);
  return resArr;
}

(async () => {
  const res = await promisePool4(
    [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ],
    2,
  );
  console.log("promisePool4", res);
})();

(async () => {
  const res = await promisePool(
    [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ],
    2,
  );
  console.log("promisePool", res);
})();

(async () => {
  const res = await promisePool2(
    [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ],
    2,
  );
  console.log("promisePool2", res);
})();

(async () => {
  const res = await promisePool3(
    [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
    ],
    2,
  );
  console.log("promisePool3", res);
})();

export { promisePool, promisePool2, promisePool3, promisePool4 };
