/* eslint-disable @typescript-eslint/no-this-alias */
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

/**
 * @param {Function} fn
 * @param {number} t
 * @return {Function}
 */
function throttle3(fn, t) {
  let nextCallTime = 0;
  let timer = null;

  return function (...args) {
    const ctx = this;
    const delay = Math.max(0, nextCallTime - Date.now());
    clearTimeout(timer);
    timer = setTimeout(() => {
      fn.call(ctx, ...args);
      nextCallTime = Date.now() + t;
    }, delay);
  };
}

export { debounce, throttle, throttle2, throttle3 };
