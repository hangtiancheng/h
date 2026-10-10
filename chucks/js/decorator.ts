/* eslint-disable */
(() => {
  const ClassDecoratorInst: ClassDecorator = (target) => {
    console.log(target.name);
    console.log(typeof target);
    target.prototype.name = "NewSugar";
  };

  @ClassDecoratorInst
  class Sugar {}

  const sugar: any = new Sugar();
  console.log(sugar.name);
})();

(() => {
  const PropDecoratorInst: PropertyDecorator = (target, propKey) => {
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
  console.log(sugar.name);
  console.log(sugar.add(1, 2));
  console.log(sugar.sub(1, 2));
})();

(() => {
  const MethodDecoratorInst: MethodDecorator = (
    target,
    propKey,
    propDescriptor,
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
  console.log(sugar.name);
  sugar.name = "newSugarInst";
  console.log(sugar.name);
})();

(() => {
  const ParamDecoratorInst: ParameterDecorator = (
    target,
    propKey,
    paramIndex,
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
  console.log(sugar.name);
  sugar.name = "newSugarInst";
  console.log(sugar.name);
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
