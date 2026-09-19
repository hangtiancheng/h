/* eslint-disable */
Array.prototype.map2 = function (callback) {
  if (!Array.isArray(this) || typeof callback !== "function") {
    return;
  }
  const ans = new Array(this.length);
  for (let i = 0; i < this.length; i++) {
    if (i in this) {
      ans[i] = callback.call(this, this[i], i, this);
    }
  }
  return ans;
};

Array.prototype.map3 = function (callback) {
  if (!Array.isArray(this) || typeof callback !== "function") {
    return;
  }
  return this.reduce((ans, curVal, curIdx, arr) => {
    // if (curIdx in arr) {
    ans[curIdx] = callback.call(this, curVal, curIdx, arr);
    // }
    return ans;
  }, []);
};

Array.prototype.reduce2 = function (callback, initialValue) {
  if (!Array.isArray(this) || typeof callback !== "function") {
    return;
  }
  let ans;
  if (initialValue !== undefined) {
    ans = initialValue;
  }
  for (let i = 0; i < this.length; i++) {
    if (i in this) {
      ans = callback(ans, this[i], i, this);
    }
  }
  return ans;
};

const arr = [1, , 2, , , 3];

const res = arr.map((curVal, curIdx, arr) => curVal * curVal);
console.log(res);

const res2 = arr.map2((curVal, curIdx, arr) => curVal * curVal);
console.log(res2);

const res3 = arr.map3((curVal, curIdx, arr) => curVal * curVal);
console.log(res3);

const res4 = arr.reduce((accVal, curVal, curIdx, arr) => accVal + curVal, 0);
console.log(res4);

const res5 = arr.reduce2((accVal, curVal, curIdx, arr) => accVal + curVal, 0);
console.log(res5);

function task1(val) {
  return new Promise((resolve) => resolve(val + 1));
}

function task2(val) {
  return new Promise((resolve) => resolve(val * 2));
}

function task3(val) {
  return val * 3;
}

function bootstrap(taskArr, val) {
  return taskArr.reduce((p, curTask) => {
    console.log(p);
    return p.then(curTask);
  }, Promise.resolve(val));
}

bootstrap([task1, task2, task3], 1).then(console.log);
