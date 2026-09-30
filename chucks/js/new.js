const isObject = (res) => {
  return typeof res === "object" && res !== null;
};

function newV2(Constructor, ...args) {
  if (typeof Constructor !== "function") {
    return;
  }
  const obj = Object.create(Constructor.prototype);
  const res = Constructor.apply(obj, args);
  return isObject(res) ? res : obj;
}

export default newV2;
