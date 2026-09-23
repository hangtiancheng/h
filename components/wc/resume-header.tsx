/** @jsxImportSource @yukino.js/lit-jsx */

import { LitElement, customElement, property, state } from "@yukino.js/lit-jsx";

import type { Labels } from "@/lib/resume/schema";

// Public asset URLs are not resolved against basePath, so carry /h manually
const AVATAR_URL = "/h/avatar.jpeg";

const FALLBACK_LABELS: Labels = { tel: "", email: "", github: "", switch: "" };

/** Fired when the language toggle button is clicked. Carries no detail. */
export type ToggleLocaleEvent = CustomEvent<null>;

/**
 * Resume header. Pure presentation — data arrives through reactive
 * properties, and the language toggle dispatches a bubbling, composed
 * `toggle-locale` custom event instead of calling a callback prop
 * (lit-jsx does not auto-bind `onXxx` on custom elements).
 *
 * Renders into light DOM (no shadow root) so the global Tailwind stylesheet
 * applies to the template; the host is given the Tailwind `block` utility
 * because custom elements default to `display: inline`.
 */
@customElement("resume-header")
export class ResumeHeaderElement extends LitElement {
  // `declare` + constructor init is the Lit-safe pattern under native
  // class-field semantics.
  @property() declare name: string;

  @property() declare about: string;

  @property() declare tel: string;

  @property() declare email: string;

  @property() declare github: string;

  /**
   * Locale-aware chrome labels (contact chips, language toggle button).
   * Settable as a property or as a JSON `labels` attribute (Lit Object
   * converter).
   */
  @property({ type: Object }) declare labels: Labels;

  /** Whether the enlarged avatar overlay is open. */
  @state() declare private previewing: boolean;

  constructor() {
    super();
    this.name = "";
    this.about = "";
    this.tel = "";
    this.email = "";
    this.github = "";
    this.labels = FALLBACK_LABELS;
    this.previewing = false;
  }

  protected override createRenderRoot(): HTMLElement {
    return this;
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.classList.add("block");
  }

  private toggleLocale(): void {
    this.dispatchEvent(
      new CustomEvent<null>("toggle-locale", {
        detail: null,
        bubbles: true,
        composed: true,
      }),
    );
  }

  private closePreview(e: MouseEvent): void {
    // Delegated click on the backdrop; clicking the enlarged image itself
    // must not dismiss.
    const hit = e.target;
    if (hit instanceof HTMLElement && hit.tagName === "IMG") return;
    this.previewing = false;
  }

  protected override render() {
    return (
      <>
        <div className="flex items-center gap-3 rounded-2xl border bg-fd-card p-4 shadow-lg">
          <img
            src={AVATAR_URL}
            alt={this.name}
            width={64}
            height={64}
            className="size-16 shrink-0 cursor-zoom-in rounded-md border object-cover"
            fetchPriority="low"
            onClick={() => (this.previewing = true)}
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <h1 className="text-xl font-semibold text-fd-foreground">
                {this.name}
              </h1>
              <button
                type="button"
                className="rounded-md border bg-fd-secondary px-2 py-0.5 text-xs font-medium text-fd-secondary-foreground transition-colors hover:bg-fd-accent print:hidden"
                onClick={this.toggleLocale}
              >
                {this.labels.switch}
              </button>
            </div>
            <p className="mt-1 text-xs text-fd-muted-foreground">
              {this.about}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  {this.labels.tel}
                </span>
                <a
                  href={`tel:${this.tel}`}
                  className="text-fd-foreground hover:text-brand hover:underline"
                >
                  {this.tel}
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  {this.labels.email}
                </span>
                <a
                  href={`mailto:${this.email}`}
                  className="text-fd-foreground hover:text-brand hover:underline"
                >
                  {this.email}
                </a>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[10px] font-medium text-brand">
                  {this.labels.github}
                </span>
                <a
                  href={`https://github.com/${this.github}`}
                  className="text-fd-foreground hover:text-brand hover:underline"
                  target="_blank"
                  rel="noopener"
                >
                  https://github.com/{this.github}
                </a>
              </div>
            </div>
          </div>
        </div>

        {this.previewing ? (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={this.closePreview}
          >
            <img
              src={AVATAR_URL}
              alt={this.name}
              className="max-h-[80vh] max-w-[80vw] rounded-lg shadow-2xl"
            />
          </div>
        ) : null}
      </>
    );
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "resume-header": ResumeHeaderElement;
  }

  interface HTMLElementEventMap {
    "toggle-locale": ToggleLocaleEvent;
  }
}
