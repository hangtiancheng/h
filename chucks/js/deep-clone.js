// @ts-check

/**
 *
 * @param {any} obj
 * @param {WeakMap<object, object>} seen 保存原对象到克隆对象的映射
 * @returns {any}
 */
function deepClone(obj, seen = new WeakMap()) {
  // 基础类型
  if (obj === null || typeof obj !== "object") {
    return obj;
  }

  // 循环引用
  if (seen.has(obj)) {
    return seen.get(obj);
  }

  let clone;

  if (obj instanceof Date) {
    clone = new Date(obj);
    seen.set(obj, clone);
    return clone;
  }

  if (obj instanceof RegExp) {
    clone = new RegExp(obj.source, obj.flags);
    clone.lastIndex = obj.lastIndex;
    seen.set(obj, clone);
    return clone;
  }

  clone = Array.isArray(obj) ? [] : {};
  seen.set(obj, clone);

  for (const key in obj) {
    // 过滤原型链属性
    // eslint-disable-next-line no-prototype-builtins
    if (obj.hasOwnProperty(key)) {
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore
      clone[key] = deepClone(obj[key], seen);
    }
  }

  return clone;
}

export default deepClone;
