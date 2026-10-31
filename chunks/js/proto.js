/* eslint-disable @typescript-eslint/no-empty-function, @typescript-eslint/no-extraneous-class, @typescript-eslint/class-literal-property-style, no-prototype-builtins -- the snippets deliberately exercise these patterns */

console.log(Object.__proto__ === Function.prototype);
console.log(Function.__proto__ === Function.prototype);
console.log(Function instanceof Function);
console.log(Object instanceof Function);

console.log(Function instanceof Object);

console.log(Function.prototype.__proto__ === Object.prototype);
console.log(Object.prototype.__proto__ === null);

console.log(typeof Function.prototype);
console.log(Function.prototype());
console.log(Function.prototype.__proto__ === Object.prototype);

function Widget() {}
Widget.prototype = { render() {} };

const widget = new Widget();
console.log(widget.constructor === Widget);
console.log(widget.constructor === Object);

Widget.prototype.constructor = Widget;
console.log(new Widget().constructor === Widget);

function Snapshot() {}
const earlyInstance = new Snapshot();

Snapshot.prototype = { version: 2 };
const lateInstance = new Snapshot();

console.log(
  Object.getPrototypeOf(earlyInstance) === Object.getPrototypeOf(lateInstance),
);
console.log(earlyInstance.version);
console.log(lateInstance.version);

class AcceptEverything {
  static [Symbol.hasInstance]() {
    return true;
  }
}

console.log(123 instanceof AcceptEverything);
console.log(null instanceof AcceptEverything);
console.log("str" instanceof AcceptEverything);

const lookupProto = { count: 1 };
const lookupTarget = Object.create(lookupProto);
lookupTarget.count = 2;
console.log(lookupProto.count);
console.log(Object.hasOwn(lookupTarget, "count"));

const getterHost = {
  _value: 10,
  get value() {
    return this._value;
  },
};
const getterChild = Object.create(getterHost);
getterChild._value = 99;
console.log(getterChild.value);

const readOnlySource = Object.create({
  get fixed() {
    return 1;
  },
});
try {
  readOnlySource.fixed = 5;
} catch (error) {
  console.log(error.constructor.name);
}
console.log(readOnlySource.fixed);

const literalChild = { __proto__: { fromLiteral: 1 } };
console.log(literalChild.fromLiteral);

const protoKey = "__proto__";
const computedChild = { [protoKey]: { fromComputed: 2 } };
console.log(computedChild.fromComputed);

const nullProto = Object.create(null);
nullProto.__proto__ = { fromNullProto: 3 };
console.log(nullProto.fromNullProto);

const bareObject = Object.create(null);
console.log("toString" in bareObject);

const arrayLike = Object.create(Array.prototype);
console.log(Array.isArray(arrayLike));
console.log(arrayLike instanceof Array);

console.log(Object.prototype.toString.call(null));
console.log(Object.prototype.toString.call([]));
console.log(Object.prototype.toString.call(new Map()));

class Tagged {
  get [Symbol.toStringTag]() {
    return "Custom";
  }
}
console.log(Object.prototype.toString.call(new Tagged()));

const cycleA = {};
const cycleB = {};
Object.setPrototypeOf(cycleA, cycleB);
try {
  Object.setPrototypeOf(cycleB, cycleA);
} catch (error) {
  console.log(error.constructor.name);
}

try {
  Object.setPrototypeOf({}, 42);
} catch (error) {
  console.log(error.constructor.name);
}

class Base {
  constructor() {
    console.log(new.target.name);
  }
  who() {
    return new.target;
  }
}
class Derived extends Base {}

new Derived();
console.log(new Derived().who() === Derived);

class Container {
  field = {};
  method() {}
}

const firstContainer = new Container();
const secondContainer = new Container();
console.log(firstContainer.field === secondContainer.field);
console.log(firstContainer.method === secondContainer.method);
console.log(Object.hasOwn(firstContainer, "field"));
console.log(Object.hasOwn(firstContainer, "method"));

function Hijacked() {
  return { stolen: true };
}
const hijackedInstance = new Hijacked();
console.log(hijackedInstance.stolen);
console.log(hijackedInstance instanceof Hijacked);

function ReturnsPrimitive() {
  return 42;
}
console.log(new ReturnsPrimitive() instanceof ReturnsPrimitive);

const borrowedArray = [];
console.log(borrowedArray.hasOwnProperty("length"));

Function.prototype.call.call(console.log, console, "hi");
