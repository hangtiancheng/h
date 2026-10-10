/* eslint-disable */
Function.prototype.apply2 = function (ctx, args) {
  const prop = Symbol();
  ctx[prop] = this;
  const res = ctx[prop](...args);
  delete ctx[prop];
  return res;
};

Function.prototype.call2 = function (ctx, ...args) {
  const prop = Symbol();
  ctx[prop] = this;
  const res = ctx[prop](...args);
  delete ctx[prop];
  return res;
};

Function.prototype.bind2 = function (ctx, ...args) {
  const fn = this;
  return function Bound(...rest) {
    if (new.target) {
      return new fn(...args, ...rest);
    }
    const prop = Symbol();
    ctx[prop] = fn;
    const ret = ctx[prop](...args, ...rest);
    delete ctx[prop];
    return ret;
  };
};
