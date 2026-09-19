/* eslint-disable @typescript-eslint/no-this-alias */
const obj = {
  name: "swifty",
  age: 24,
  job: "frontend",
};

obj[Symbol.iterator] = function* () {
  for (const key in obj) {
    yield obj[key];
  }
  return;
};

for (const val of obj) {
  console.log(val);
}

const obj2 = {
  name: "swifty2",
  age: 25,
  job: "backend",
};

Object.defineProperty(obj2, Symbol.iterator, {
  writable: false,
  enumerable: false,
  configurable: false,
  value: function () {
    let index = 0;
    const ctx = this;
    const keys = Object.keys(ctx);
    return {
      next() {
        return {
          done: index >= keys.length,
          value: ctx[keys[index++]],
        };
      },
    };
  },
});

for (const val of obj2) {
  console.log(val);
}
