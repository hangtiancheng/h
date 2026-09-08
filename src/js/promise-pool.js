/**
 *
 * @param {(() => Promise))[]} functions
 * @param {number} n
 * @returns
 */
export function promisePool(functions, n) {
  return new Promise((resolve) => {
    if (functions.length === 0) {
      resolve();
    }
    const buf = Array.from({ length: n }, () => null);
    let count = 0;

    const ans = Array.from({ length: functions.length });
    const pending = [];

    const addTask = (i) => {
      for (let j = 0; j < n; j++) {
        const t = functions[i];
        if (buf[j] === null) {
          buf[j] = t()
            .then((res) => {
              ans[i] = res;
              buf[j] = null;
              count++;
              if (count === functions.length) {
                resolve(ans);
              }
            })
            .finally(() => {
              if (pending.length > 0) {
                const index = pending.shift();
                addTask(index);
              }
            });

          return;
        }
      }

      pending.push(i);
    };

    for (let i = 0; i < functions.length; i++) {
      addTask(i);
    }
  });
}

/**
 *
 * @param {(() => Promise))[]} functions
 * @param {number} n
 * @returns
 */
export function promisePool2(functions, n) {
  const tasks = functions.map((f, i) => [f, i]);
  const ans = Array.from({ length: functions.length });

  // eslint-disable-next-line no-async-promise-executor
  return new Promise(async (resolve) => {
    await Promise.all(
      Array.from({ length: n }, async () => {
        while (tasks.length > 0) {
          const [f, i] = tasks.shift();
          const r = await f();
          ans[i] = r;
        }
      }),
    );

    resolve(ans);
  });
}
