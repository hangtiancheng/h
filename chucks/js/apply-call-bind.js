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

// https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Operators/new.target
Function.prototype.bind2 = function (ctx, ...args) {
  const fn = this;
  return function Bound(...rest) {
    if (new.target) {
      return new fn(...args, ...rest);
    }
    const prop = Symbol();
    ctx[prop] = fn;
    // https://developer.mozilla.org/zh-CN/docs/Web/JavaScript/Reference/Global_Objects/Array/concat
    // concat 返回一个新数组
    // args = args.concat(rest)
    const ret = ctx[prop](...args, ...rest);
    delete ctx[prop];
    return ret;
  };
};
