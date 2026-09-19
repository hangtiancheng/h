/**
 * @param {Function} fn
 * @return {Function}
 */
function curry(fn) {
  const aggregatedArgs = [];
  // 函数的长度, 即函数的参数列表的长度
  const argsCnt = fn.length;
  // console.log(fn.length === fn.arguments.length)
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
const ans = curriedSum(1)(2); // 3
console.log(ans);
