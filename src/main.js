const arr = [1, 2, 3];

arr[Symbol.asyncIterator] = function () {
  const syncIter = this[Symbol.iterator]();
  return {
    next() {
      const result = syncIter.next();
      return Promise.resolve(result);
    },
  };
};

(async () => {
  for await (const v of arr) {
    console.log(v); // 1, 2, 3
  }
})();

const arr2 = [1, 2, 3];

arr2[Symbol.asyncIterator] = async function* () {
  const syncIter = this[Symbol.iterator]();
  let result = syncIter.next();
  while (!result.done) {
    yield result.value;
    result = syncIter.next();
  }
};

(async () => {
  for await (const v of arr) {
    console.log(v); // 1, 2, 3
  }
})();

const arr3 = [1, 2, 3];

arr3[Symbol.asyncIterator] = async function* () {
  yield* this;
};
