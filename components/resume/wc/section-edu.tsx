/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, property } from "@yukino.js/lit-jsx";

/**
 * Education section. Each row is `[school, degree, period]`.
 *
 * Renders into light DOM (no shadow root) so the global Tailwind stylesheet
 * applies to the template; the host is given the Tailwind `block` utility
 * because custom elements default to `display: inline`.
 */
@customElement("section-edu")
export class SectionEduElement extends LitElement {
  /** Section heading text. */
  @property() declare header: string;

  /**
   * Education rows, three columns per row. Settable as a property or as a
   * JSON `edu` attribute (Lit Array converter).
   */
  @property({ type: Array }) declare edu: string[][];

  constructor() {
    super();
    this.header = "";
    this.edu = [];
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
          {this.edu.map((row) => (
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
    "section-edu": SectionEduElement;
  }
}
