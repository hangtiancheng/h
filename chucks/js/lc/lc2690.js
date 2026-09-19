function createInfiniteObject() {
  const obj = {};
  return new Proxy(obj, {
    get(target, p) {
      return () => p;
    },
  });
}

const obj = createInfiniteObject();
console.log(obj.abc123());
