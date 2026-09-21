// Side-effect import that registers the resume custom elements. Client-only:
// the lit-jsx `customElement` decorator calls `customElements.define` at
// module load, which does not exist during Next's build-time prerender.
import "./resume-view";
