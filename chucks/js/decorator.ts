/* eslint-disable */
(() => {
  const ClassDecoratorInst: ClassDecorator = (target) => {
    // target: 类, 类是构造函数的语法糖
    console.log(target.name); // Sugar
    console.log(typeof target); // function
    target.prototype.name = "NewSugar";
  };

  @ClassDecoratorInst
  class Sugar {}

  const sugar: any = new Sugar();
  console.log(sugar.name); // NewSugar
})();

(() => {
  const PropDecoratorInst: PropertyDecorator = (target, propKey) => {
    // target: 原型对象
    // propKey: 属性名
    console.log(target, propKey);
  };

  class Sugar {
    @PropDecoratorInst
    public name: string = "sugarInst";

    @PropDecoratorInst
    add = function (a: number, b: number) {
      return a + b;
    };

    @PropDecoratorInst
    sub = (a: number, b: number) => a - b;
  }

  const sugar = new Sugar();
  console.log(sugar.name); // sugarInst
  console.log(sugar.add(1, 2)); // 3
  console.log(sugar.sub(1, 2)); // -1
})();

(() => {
  const MethodDecoratorInst: MethodDecorator = (
    target, // 原型对象
    propKey, // 属性名, 即方法名
    propDescriptor, // 属性描述对象
  ) => {
    console.log(target, propKey, propDescriptor);
  };

  class Sugar {
    private _name: string = "sugarInst";

    @MethodDecoratorInst
    foo(a: number, b: number) {
      return a + b;
    }

    @MethodDecoratorInst
    get name() {
      return this._name;
    }

    set name(newName: string) {
      this._name = newName;
    }
  }

  const sugar = new Sugar();
  console.log(sugar.name); // sugarInst
  sugar.name = "newSugarInst";
  console.log(sugar.name); // newSugarInst
})();

(() => {
  const ParamDecoratorInst: ParameterDecorator = (
    target, // 原型对象
    propKey, // 属性名, 即方法名
    paramIndex, // 参数索引
  ) => {
    console.log(target, propKey, paramIndex);
  };

  class Sugar {
    private _name: string = "sugarInst";

    add(@ParamDecoratorInst a: number, @ParamDecoratorInst b: number) {
      return a + b;
    }

    get name() {
      return this._name;
    }

    set name(@ParamDecoratorInst newName: string) {
      this._name = newName;
    }
  }

  const sugar = new Sugar();
  console.log(sugar.name); // sugarInst
  sugar.name = "newSugarInst";
  console.log(sugar.name); // newSugarInst
})();

const Get: (config: { url: string }) => MethodDecorator = ({ url }) => {
  return (target, propKey, propDescriptor) => {
    const method: any = propDescriptor.value;
    fetch(url)
      .then((res) => res.text())
      .then((data) => {
        method({ data, code: 200, msg: "OK" });
      })
      .catch((err) => {
        method({ data: JSON.stringify(err), code: 404, msg: "Not Found" });
      });
  };
};

class Controller {
  constructor() {}

  @Get({ url: "https://hangtiancheng.github.io/" })
  getHomepage(res: { data: string; code: number; msg: string }) {
    const { data, code, msg } = res;
    console.log(data, code, msg);
  }
}
