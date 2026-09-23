/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, state } from "@yukino.js/lit-jsx";

import { buildSections, resumeData, type Lang } from "@/lib/resume";

import "./art-plum";
import "./resume-header";
import "./resume-card";
import "./resume-list";

@customElement("wc-resume")
export class WcResumeElement extends LitElement {
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
      <div id="resume" className="w-full text-fd-foreground">
        <art-plum />
        <div className="relative mx-auto flex w-full max-w-4xl flex-col gap-3 px-4 pt-4 pb-8 md:px-8 md:pb-12">
          <resume-header
            name={data.name}
            about={data.about}
            tel={data.tel}
            email={data.email}
            github={data.github}
            labels={data.labels}
          />

          <resume-card header={data.headers.edu} items={data.edu} />

          {sections.map((section) => (
            <resume-list header={section.title} items={section.items} />
          ))}
        </div>
      </div>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "wc-resume": WcResumeElement;
  }
}
