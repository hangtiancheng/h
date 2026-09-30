function instanceofV2(left, right) {
  if (typeof left !== "object" || typeof right !== "function") {
    return false;
  }

  while (true) {
    if (left === null) {
      return false;
    }
    if (Object.getPrototypeOf(left) === right.prototype) {
      return true;
    }
    left = Object.getPrototypeOf(left);
  }
}

class Cat {
  name = "Meow";
}

console.log(instanceofV2(new Cat(), Cat));

console.log(Cat[Symbol.hasInstance]);
