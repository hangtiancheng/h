const typeOf = (val) => Object.prototype.toString.call(val);

console.log({
  undefined: typeOf(undefined),
  null: typeOf(null),
  boolean: typeOf(true),
  number: typeOf(42),
  NaN: typeOf(NaN),
  string: typeOf("hello"),
  symbol: typeOf(Symbol("s")),
  bigint: typeOf(42n),

  object: typeOf({}),
  array: typeOf([]),
  date: typeOf(new Date()),
  regexp: typeOf(/abc/),
  map: typeOf(new Map()),
  set: typeOf(new Set()),
  weakMap: typeOf(new WeakMap()),
  weakSet: typeOf(new WeakSet()),
  promise: typeOf(Promise.resolve()),
  error: typeOf(new Error()),
  function: typeOf(function () {}),
  arrowFn: typeOf(() => {}),
  asyncFn: typeOf(async function () {}),
  generatorFn: typeOf(function* () {}),

  int8Array: typeOf(new Int8Array(1)),
  uint8Array: typeOf(new Uint8Array(1)),
  float64Array: typeOf(new Float64Array(1)),
  arrayBuffer: typeOf(new ArrayBuffer(8)),
  dataView: typeOf(new DataView(new ArrayBuffer(8))),

  booleanObj: typeOf(new Boolean(true)),
  numberObj: typeOf(new Number(42)),
  stringObj: typeOf(new String("hi")),

  math: typeOf(Math),
  json: typeOf(JSON),

  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  customClass: typeOf(new (class Foo {})()),

  arguments: (function () {
    return typeOf(arguments);
  })(),
  customTag: typeOf({ [Symbol.toStringTag]: "CustomTag" }),
});
