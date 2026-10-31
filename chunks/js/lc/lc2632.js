function curry(fn) {
  const aggregatedArgs = [];
  const argsCnt = fn.length;
  return function curried(...args) {
    aggregatedArgs.push(...args);
    if (aggregatedArgs.length === argsCnt) {
      return fn.apply(this, aggregatedArgs);
    }
    return curried;
  };
}

function sum(a, b) {
  return a + b;
}
const curriedSum = curry(sum);
const ans = curriedSum(1)(2);
console.log(ans);
