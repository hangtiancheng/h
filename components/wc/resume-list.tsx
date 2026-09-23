/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, property } from "@yukino.js/lit-jsx";

import type { TitledItem } from "@/lib/resume/schema";

@customElement("resume-list")
export class ResumeListElement extends LitElement {
  @property() declare header: string;

  @property({ type: Array }) declare items: (string | TitledItem)[];

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
        <ul className="mt-2 ml-4 list-disc space-y-0.5 text-xs text-fd-muted-foreground">
          {this.items.map((item) =>
            typeof item === "string" ? (
              <li>{item}</li>
            ) : (
              <li>
                <b className="font-semibold text-fd-foreground">{item.title}</b>
                : {item.content}
              </li>
            ),
          )}
        </ul>
      </section>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "resume-list": ResumeListElement;
  }
}
