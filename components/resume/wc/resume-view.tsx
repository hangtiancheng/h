/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, state } from "@yukino.js/lit-jsx";

import { buildSections, resumeData, type Lang } from "@/lib/resume";

import "./art-plum";
import "./resume-header";
import "./section-edu";
import "./section-list";

/**
 * Root resume view. Holds the active locale and listens for the bubbling,
 * composed `toggle-locale` event dispatched by <resume-header> — lit-jsx
 * does not auto-bind `onXxx` props on custom elements, so events travel
 * through the DOM instead of callbacks.
 */
@customElement("resume-view")
export class ResumeViewElement extends LitElement {
  /** Active resume language. Not `lang` — that collides with the native
   * HTMLElement.lang property. `declare` + constructor init is the Lit-safe
   * pattern under native class-field semantics. */
  @state() declare private locale: Lang;

  constructor() {
    super();
    this.locale = "en";
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add("block");
    this.addEventListener("toggle-locale", this.onToggleLocale);
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener("toggle-locale", this.onToggleLocale);
  }

  private onToggleLocale = (): void => {
    this.locale = this.locale === "en" ? "zh" : "en";
  };

  protected override render() {
    const data = resumeData[this.locale];
    const sections = buildSections(data);

    return (
      // `id` anchors the print rule in global.css that hides the site nav
      <div id="resume" className="w-full text-fd-foreground">
        <art-plum />
        {/* `relative` stacks the content above the fixed <art-plum> canvas. */}
        <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-4 pb-8 md:px-8 md:pb-12">
          <resume-header
            name={data.name}
            about={data.about}
            tel={data.tel}
            email={data.email}
            github={data.github}
            labels={data.labels}
          />

          <section-edu header={data.headers.edu} edu={data.edu} />

          {sections.map((section) => (
            <section-list heading={section.title} items={section.items} />
          ))}
        </div>
      </div>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "resume-view": ResumeViewElement;
  }
}
