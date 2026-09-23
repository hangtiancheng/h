/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, property } from "@yukino.js/lit-jsx";

@customElement("resume-card")
export class ResumeCardElement extends LitElement {
  @property() declare header: string;
  @property({ type: Array }) declare items: string[][];

  constructor() {
    super();
    this.header = "";
    this.items = [];
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add("block");
  }

  protected override render() {
    return (
      <section className="rounded-2xl border bg-fd-card p-4 shadow-lg">
        <h2 className="text-sm font-semibold text-fd-foreground">
          {this.header}
        </h2>
        <div className="my-2 h-px bg-fd-border" />
        <ul className="mt-2 space-y-0.5 text-xs">
          {this.items.map((row) => (
            <li className="grid gap-1 md:grid-cols-3">
              <div className="text-fd-muted-foreground">{row[0]}</div>
              <div className="text-fd-muted-foreground">{row[1]}</div>
              <div className="text-fd-muted-foreground">{row[2]}</div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "resume-card": ResumeCardElement;
  }
}
