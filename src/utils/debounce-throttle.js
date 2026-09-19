/* eslint-disable @typescript-eslint/no-this-alias */
/**
 *
 * @param {(...args: unknown[]) => unknown} fn
 * @param {number} delay
 * @returns {(...args: unknown[]) => unknown}
 */
function debounce(fn, delay = 500) {
  let timer = null;
  return function (...args) {
    const ctx = this;
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      fn.call(ctx, ...args);
      timer = null;
    }, delay);
  };
}

/**
 *
 * @param {(...args: unknown[]) => unknown} fn
 * @param {number} delay
 * @returns {(...args: unknown[]) => unknown}
 */
function throttle(fn, delay = 500) {
  let lastTime = 0;

  return function (...args) {
    const ctx = this;
    if (lastTime == 0) {
      fn.apply(ctx, args);
      lastTime = Date.now();
    }
    const remain = delay - (Date.now() - lastTime);
    if (remain <= 0) {
      fn.apply(ctx, args);
      lastTime = Date.now();
    }
  };
}

/**
 *
 * @param {(...args: unknown[]) => unknown} fn
 * @param {number} delay
 * @returns {(...args: unknown[]) => unknown}
 */
function throttle2(fn, delay = 500) {
  let timer = null;

  return function (...args) {
    const ctx = this;
    if (timer) {
      return;
    }
    timer = setTimeout(() => {
      fn.call(ctx, ...args);
      timer = null;
    }, delay);
  };
}

const fn = console.log;
const throttledFn = throttle(fn);

throttledFn("Hello 1");
throttledFn("Hello 2");

setTimeout(() => {
  throttledFn("Hello 3");
}, 300);

setTimeout(() => {
  throttledFn("Hello 4");
  throttledFn("Hello 5");
}, 700);

export { debounce, throttle, throttle2 };
