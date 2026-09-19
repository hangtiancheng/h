function extendsImpl(Parent, Child) {
  const proto = Object.create(Parent.prototype);
  proto.constructor = Child;
  Child.prototype = proto;
  // 继承静态属性
  Object.setPrototypeOf(Child, Parent);
}

function Parent(name) {
  this.name = name;
  this.hobbies = ["reading"];
}

Parent.prototype.getName = function () {
  return this.name;
};

function Child(name, age) {
  Parent.call(this, name);
  this.age = age;
}

extendsImpl(Parent, Child);

const child = new Child("Alice", 23);
const child2 = new Child("Bob", 24);

child.name = "Cook";
console.log(child.name); // Cook
console.log(child2.name); // Bob

child2.hobbies.push("coding");
console.log(child.hobbies); // [ 'reading' ]
console.log(child2.hobbies); // [ 'reading', 'coding' ]

console.log(child.getName()); // Cook
console.log(child2.getName()); // Bob
