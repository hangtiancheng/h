/**
 * Prototype chain tricks.
 *
 * Every snippet below is runnable as-is. They are grouped by theme and ordered
 * from the foundational "root" relationships down to the more exotic behaviors.
 * The goal is to expose how functions, objects, constructors and instances are
 * all wired into a single circular structure.
 */

/* -------------------------------------------------------------------------- */
/* 1. The root cycle: who is an instance of whom                              */
/* -------------------------------------------------------------------------- */

// Functions are instances of Function — including Function and Object themselves.
console.log(Object.__proto__ === Function.prototype); // true
console.log(Function.__proto__ === Function.prototype); // true  (Function is its own instance)
console.log(Function instanceof Function); // true
console.log(Object instanceof Function); // true

// Yet the Function object is also an instance of Object.
console.log(Function instanceof Object); // true

// The root and the terminus of every prototype chain.
console.log(Function.prototype.__proto__ === Object.prototype); // true (function objects hang under Object)
console.log(Object.prototype.__proto__ === null); // true (the chain ends at null)

/* -------------------------------------------------------------------------- */
/* 2. Function.prototype is a callable but non-constructable "empty function" */
/* -------------------------------------------------------------------------- */

console.log(typeof Function.prototype); // "function"
console.log(Function.prototype()); // undefined — it can be invoked
// new Function.prototype();          // TypeError: not a constructor (no [[Construct]])
console.log(Function.prototype.__proto__ === Object.prototype); // true

/* -------------------------------------------------------------------------- */
/* 3. `constructor` is just an ordinary property — it can be severed          */
/* -------------------------------------------------------------------------- */

function Widget() {}
Widget.prototype = { render() {} }; // replacing the whole prototype object drops the constructor back-pointer

const widget = new Widget();
console.log(widget.constructor === Widget); // false
console.log(widget.constructor === Object); // true — lookup climbs to Object.prototype.constructor

// Idiomatic fix: restore the back-pointer after replacing the prototype.
Widget.prototype.constructor = Widget;
console.log(new Widget().constructor === Widget); // true

/* -------------------------------------------------------------------------- */
/* 4. An instance remembers "that object", not "that name"                    */
/* -------------------------------------------------------------------------- */

function Snapshot() {}
const earlyInstance = new Snapshot();

Snapshot.prototype = { version: 2 }; // reassigning prototype does NOT retroactively move old instances
const lateInstance = new Snapshot();

console.log(
  Object.getPrototypeOf(earlyInstance) === Object.getPrototypeOf(lateInstance),
); // false
console.log(earlyInstance.version); // undefined
console.log(lateInstance.version); // 2

/* -------------------------------------------------------------------------- */
/* 5. `instanceof` can be hijacked via Symbol.hasInstance                     */
/* -------------------------------------------------------------------------- */

class AcceptEverything {
  static [Symbol.hasInstance]() {
    return true;
  }
}

console.log(123 instanceof AcceptEverything); // true
console.log(null instanceof AcceptEverything); // true
console.log("str" instanceof AcceptEverything); // true

/* -------------------------------------------------------------------------- */
/* 6. Three property-lookup gotchas                                           */
/* -------------------------------------------------------------------------- */

// (a) Assignment always lands on the receiver as an own property; it never writes "through" to the prototype.
const lookupProto = { count: 1 };
const lookupTarget = Object.create(lookupProto);
lookupTarget.count = 2;
console.log(lookupProto.count); // 1 — the prototype is untouched
console.log(Object.hasOwn(lookupTarget, "count")); // true

// (b) Inside a getter, `this` is the object that initiated the call, not where the getter is defined.
const getterHost = {
  _value: 10,
  get value() {
    return this._value;
  },
};
const getterChild = Object.create(getterHost);
getterChild._value = 99;
console.log(getterChild.value); // 99 — `this` is getterChild, not getterHost

// (c) A prototype getter without a matching setter blocks assignment.
//     In strict mode (ESM, "use strict") it throws; in sloppy mode it fails silently.
const readOnlySource = Object.create({
  get fixed() {
    return 1;
  },
});
try {
  readOnlySource.fixed = 5; // throws here because this module is strict-mode ESM
} catch (error) {
  console.log(error.constructor.name); // TypeError
}
console.log(readOnlySource.fixed); // 1 — nothing was written

/* -------------------------------------------------------------------------- */
/* 7. `__proto__` wears two faces                                             */
/* -------------------------------------------------------------------------- */

// In an object literal, `__proto__` is special syntax that sets the prototype directly.
const literalChild = { __proto__: { fromLiteral: 1 } };
console.log(literalChild.fromLiteral); // 1

// Once the key becomes computed, it degrades to a plain data property.
const protoKey = "__proto__";
const computedChild = { [protoKey]: { fromComputed: 2 } };
console.log(computedChild.fromComputed); // undefined

// On a null-prototype object there is no `__proto__` accessor at all, so assignment creates an own property.
const nullProto = Object.create(null);
nullProto.__proto__ = { fromNullProto: 3 };
console.log(nullProto.fromNullProto); // undefined

/* -------------------------------------------------------------------------- */
/* 8. Severing the prototype chain                                            */
/* -------------------------------------------------------------------------- */

const bareObject = Object.create(null);
console.log("toString" in bareObject); // false — not even toString exists
// bareObject + ""; // TypeError: Cannot convert object to primitive value

// Array.isArray checks the internal [[IsArray]] exotic slot, NOT the prototype chain.
// So prototype manipulation cannot fool it — unlike instanceof, which can.
const arrayLike = Object.create(Array.prototype);
console.log(Array.isArray(arrayLike)); // false — exotic slot is absent
console.log(arrayLike instanceof Array); // true — instanceof only walks the prototype chain

/* -------------------------------------------------------------------------- */
/* 9. The toString mirror and Symbol.toStringTag                             */
/* -------------------------------------------------------------------------- */

console.log(Object.prototype.toString.call(null)); // "[object Null]"
console.log(Object.prototype.toString.call([])); // "[object Array]"
console.log(Object.prototype.toString.call(new Map())); // "[object Map]"

class Tagged {
  get [Symbol.toStringTag]() {
    return "Custom";
  }
}
console.log(Object.prototype.toString.call(new Tagged())); // "[object Custom]"

/* -------------------------------------------------------------------------- */
/* 10. The chain can be neither cyclic nor non-object                         */
/* -------------------------------------------------------------------------- */

const cycleA = {};
const cycleB = {};
Object.setPrototypeOf(cycleA, cycleB);
try {
  Object.setPrototypeOf(cycleB, cycleA); // TypeError: cyclic __proto__
} catch (error) {
  console.log(error.constructor.name); // TypeError
}

try {
  Object.setPrototypeOf({}, 42); // TypeError: prototype must be an object or null
} catch (error) {
  console.log(error.constructor.name); // TypeError
}

/* -------------------------------------------------------------------------- */
/* 11. new.target knows which constructor was actually invoked                */
/* -------------------------------------------------------------------------- */

class Base {
  constructor() {
    console.log(new.target.name);
  }
  who() {
    return new.target;
  }
}
class Derived extends Base {}

new Derived(); // "Derived" — even though the constructor body lives in Base
console.log(new Derived().who() === Derived); // true

/* -------------------------------------------------------------------------- */
/* 12. Methods are shared on the prototype; fields are own per instance       */
/* -------------------------------------------------------------------------- */

class Container {
  field = {}; // own property — one fresh copy per instance
  method() {} // lives on Container.prototype — shared by all instances
}

const firstContainer = new Container();
const secondContainer = new Container();
console.log(firstContainer.field === secondContainer.field); // false
console.log(firstContainer.method === secondContainer.method); // true
console.log(Object.hasOwn(firstContainer, "field")); // true
console.log(Object.hasOwn(firstContainer, "method")); // false

/* -------------------------------------------------------------------------- */
/* 13. A constructor returning an object performs a "bait and switch"         */
/* -------------------------------------------------------------------------- */

function Hijacked() {
  return { stolen: true };
}
const hijackedInstance = new Hijacked();
console.log(hijackedInstance.stolen); // true
console.log(hijackedInstance instanceof Hijacked); // false — the returned object is off the prototype chain

function ReturnsPrimitive() {
  return 42;
}
console.log(new ReturnsPrimitive() instanceof ReturnsPrimitive); // true — primitive returns are ignored by `new`

/* -------------------------------------------------------------------------- */
/* 14. Borrowing methods up the chain                                         */
/* -------------------------------------------------------------------------- */

const borrowedArray = [];
console.log(borrowedArray.hasOwnProperty("length")); // true — borrowed from Object.prototype

// `call` is itself a function, so we can use `call` to call `call`.
Function.prototype.call.call(console.log, console, "hi"); // prints "hi"
