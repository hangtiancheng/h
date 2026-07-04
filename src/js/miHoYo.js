// @ts-check

class Parent {
  a = (() => {
    console.log("Parent init");
  })();

  constructor() {
    console.log("Parent constructor");
    this.run();
    this.runA();
  }

  run() {
    console.log("Parent run");
  }

  runA() {
    console.log("Parent runA");
  }
}

class Child extends Parent {
  a = (() => {
    console.log("Child init");
  })();

  /** @type {number | undefined} */
  initialValue = undefined;

  constructor() {
    super();
    console.log("Child constructor");
  }

  run() {
    this.initialValue = 3;
    console.log("Child run");
  }

  runA() {
    console.log("Child runA");
  }
}

const child = new Child();

console.log(child.initialValue);

export default {};
