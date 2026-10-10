const _constructor = Function.prototype.constructor;
Function.prototype.constructor = function (...args) {
  if (args.some((a) => typeof a === "string" && a.includes("debugger"))) {
    return function () {};
  }
  return _constructor.apply(this, args);
};
