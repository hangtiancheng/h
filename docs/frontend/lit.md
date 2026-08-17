# Lit

## Components

### 装饰器

```json
// tsconfig.json
{
  "compilerOptions": {
    "experimentalDecorators": true,
    "emitDecoratorMetadata": false,
    "useDefineForClassFields": false
  }
```

```ts
@customElement("my-element")
export class MyElement extends LitElement {
  // Define scoped styles right with your component, in plain CSS
  static styles = css`
    :host {
      color: lightblue;
    }
  `;

  // Declare reactive properties
  @property()
  name?: string = "World";

  // Render the UI as a function of component state
  render() {
    return html`<p>Hello, ${this.name}!</p>`;
  }
}
```

### 定义组件

- 创建一个继承 `LitElement` 的类, 并注册到浏览器
- 定义一个 Lit 组件, 实际上是[自定义元素](https://developer.mozilla.org/en-US/docs/Web/Web_Components/Using_custom_elements)

```ts
// 使用装饰器
@customElement("my-element")
export class MyElement extends LitElement {}

// 不使用装饰器
// @customElement 是 [customElements.define](https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define) 的简写形式
customElements.define("my-element", MyElement);

// 提供类型支持
declare global {
  interface HTMLElementTagNameMap {
    "my-element": MyElement;
  }
}
```

### 事件

- 点击按钮时, 按钮会派发 click 事件
- 输入框中输入时, 输入框会派发 change 事件
