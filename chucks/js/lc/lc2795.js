/**
 * @param {Array<Function>} functions
 * @return {Promise<Array>}
 */
async function promiseAllSettled(functions) {
  const ans = Array.from({ length: functions.length });
  const promises = functions.map((fn, i) => {
    fn[i]()
      .then((res) => {
        ans[i] = { status: "fulfilled", value: res };
      })
      .catch((err) => {
        ans[i] = { status: "rejected", reason: err };
      });
  });
  return Promise.all(promises);
}

function promiseAllSettled2(functions) {
  const ans = Array.from({ length: functions.length });
  let settledCnt = 0;
  return new Promise((resolve) => {
    for (let i = 0; i < functions.length; i++) {
      functions[i]()
        .then((res) => {
          ans[i] = { status: "fulfilled", value: res };
        })
        .catch((err) => {
          ans[i] = { status: "rejected", reason: err };
        })
        .finally(() => {
          settledCnt++;
          if (settledCnt === functions.length) {
            resolve(ans);
          }
        });
    }
  });
}

export { promiseAllSettled, promiseAllSettled2 };
