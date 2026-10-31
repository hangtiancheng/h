function extendsImpl(Parent, Child) {
  const proto = Object.create(Parent.prototype);
  proto.constructor = Child;
  Child.prototype = proto;
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
console.log(child.name);
console.log(child2.name);

child2.hobbies.push("coding");
console.log(child.hobbies);
console.log(child2.hobbies);

console.log(child.getName());
console.log(child2.getName());
