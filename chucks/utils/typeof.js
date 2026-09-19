const typeOf = (val) => Object.prototype.toString.call(val);

console.log({
  // 基础类型
  undefined: typeOf(undefined), // undefined: "[object Undefined]"
  null: typeOf(null), // null: "[object Null]"
  boolean: typeOf(true), // boolean: "[object Boolean]"
  number: typeOf(42), // number: "[object Number]"
  NaN: typeOf(NaN), // NaN: "[object Number]"
  string: typeOf("hello"), // string: "[object String]"
  symbol: typeOf(Symbol("s")), // symbol: "[object Symbol]"
  bigint: typeOf(42n), // bigint: "[object BigInt]"

  // 内置对象
  object: typeOf({}), // object: "[object Object]"
  array: typeOf([]), // array: "[object Array]"
  date: typeOf(new Date()), // date: "[object Date]"
  regexp: typeOf(/abc/), // regexp: "[object RegExp]"
  map: typeOf(new Map()), // map: "[object Map]"
  set: typeOf(new Set()), // set: "[object Set]"
  weakMap: typeOf(new WeakMap()), // weakMap: "[object WeakMap]"
  weakSet: typeOf(new WeakSet()), // weakSet: "[object WeakSet]"
  promise: typeOf(Promise.resolve()), // promise: "[object Promise]"
  error: typeOf(new Error()), // error: "[object Error]"
  function: typeOf(function () {
    /** noop */
  }), // function: "[object Function]"
  arrowFn: typeOf(() => {
    /** noop */
  }), // arrowFn: "[object Function]"
  asyncFn: typeOf(async function () {
    /** noop */
  }), // asyncFn: "[object AsyncFunction]"
  generatorFn: typeOf(function* () {
    /** noop */
  }), // generatorFn: "[object GeneratorFunction]"

  // TypedArray / Buffer
  int8Array: typeOf(new Int8Array(1)), // int8Array: "[object Int8Array]"
  uint8Array: typeOf(new Uint8Array(1)), // uint8Array: "[object Uint8Array]"
  float64Array: typeOf(new Float64Array(1)), // float64Array: "[object Float64Array]"
  arrayBuffer: typeOf(new ArrayBuffer(8)), // arrayBuffer: "[object ArrayBuffer]"
  dataView: typeOf(new DataView(new ArrayBuffer(8))), // dataView: "[object DataView]"

  // 装箱
  booleanObj: typeOf(new Boolean(true)), // booleanObj: "[object Boolean]"
  numberObj: typeOf(new Number(42)), // numberObj: "[object Number]"
  stringObj: typeOf(new String("hi")), // stringObj: "[object String]"

  // 内置对象
  math: typeOf(Math), // math: "[object Math]"
  json: typeOf(JSON), // json: "[object JSON]"

  // 自定义类
  // eslint-disable-next-line @typescript-eslint/no-extraneous-class
  customClass: typeOf(new (class Foo {})()), // customClass: "[object Object]"

  arguments: (function () {
    return typeOf(arguments);
  })(), // arguments: "[object Arguments]"
  // 自定义 Symbol.toStringTag
  customTag: typeOf({ [Symbol.toStringTag]: "CustomTag" }), // customTag: "[object CustomTag]"
});
