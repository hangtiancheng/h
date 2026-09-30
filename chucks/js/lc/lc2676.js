/**
 * @param {Function} fn
 * @param {number} t
 * @return {Function}
 */
function throttle(fn, t) {
  let nextCallTime = 0;
  let timer = null;
  return function (...args) {
    const delay = Math.max(0, nextCallTime - Date.now());
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn(...args);
      nextCallTime = Date.now() + t;
    }, delay);
  };
}

export default throttle;
