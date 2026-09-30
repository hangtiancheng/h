const DISABLED_ARR_METHODS = new Set([
  "pop",
  "push",
  "shift",
  "unshift",
  "splice",
  "sort",
  "reverse",
]);

function makeImmutable(obj) {
  return proxify(obj);
}

const isObject = (val) => typeof val === "object" && val !== null;

const /** @type {ProxyHandler} */ propHandler = {
    get(target, p) {
      const val = Reflect.get(target, p);
      if (!isObject(val)) {
        return val;
      }
      return proxify(val);
    },
    set(target, p) {
      if (Array.isArray(target)) {
        throw `Error Modifying Index: ${p}`;
      } else {
        throw `Error Modifying: ${p}`;
      }
    },
  };
const /** @type {ProxyHandler} */ methodHandler = {
    apply(target) {
      console.log(target);
      throw `Error Calling Method: ${target.name}`;
    },
  };

function proxify(obj) {
  if (Array.isArray(obj)) {
    DISABLED_ARR_METHODS.forEach((method) => {
      obj[method] = new Proxy(obj[method], methodHandler);
    });
  }
  return new Proxy(obj, propHandler);
}

const obj = makeImmutable({ x: 5 });
obj.x = 5;
