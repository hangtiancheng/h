/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, property } from "@yukino.js/lit-jsx";

import type { TitledItem } from "@/lib/resume/schema";

/**
 * Generic list section for skills, works, projects, research.
 *
 * Renders into light DOM (no shadow root) so the global Tailwind stylesheet
 * applies to the template; the host is given the Tailwind `block` utility
 * because custom elements default to `display: inline`.
 *
 * The property is named `heading` because `title` is a global HTML attribute
 * and would trigger a native tooltip.
 */
@customElement("section-list")
export class SectionListElement extends LitElement {
  /** Section heading text. */
  @property() declare heading: string;

  /**
   * List rows: plain strings or `{ title, content }` pairs. Settable as a
   * property or as a JSON `items` attribute (Lit Array converter).
   */
  @property({ type: Array }) declare items: (string | TitledItem)[];

  constructor() {
    super();
    this.heading = "";
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
          {this.heading}
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
    "section-list": SectionListElement;
  }
}
