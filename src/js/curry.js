function curry(fn) {
  const aggregatedArgs = [];
  return function curried(...args) {
    if (args.length === 0) {
      return fn.apply(this, aggregatedArgs);
    }
    aggregatedArgs.push(...args);
    return curried;
  };
}

const sum = (...args) => {
  return args.reduce((a, b) => a + b, 0);
};

const curriedSum = curry(sum);

curriedSum(1);
curriedSum(2);
curriedSum(3, 4);

curriedSum();
