import { afterEach, describe, expect, it } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;
let second: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
  second?.destroy();
  second = null;
  document.body.innerHTML = "";
});

const STYLE_ONLY = {
  copy: false,
  keyboard: false,
  contextmenu: false,
  print: false,
};

describe("style injection", () => {
  it("injects structurally-complete user-select rules", () => {
    instance = createAntiCopy({
      ...STYLE_ONLY,
      excludeSelectors: ['div[class*="language-"]'],
    });
    instance.enable();
    const style = document.head.querySelector("style[data-anti-copy]");
    expect(style).not.toBeNull();
    const css = style!.textContent!;
    // Global disable resists page-level overrides and iOS long-press.
    expect(css).toContain("user-select: none !important");
    expect(css).toContain("-webkit-touch-callout: none");
    // Exclusions re-enable selection for the region AND its descendants
    // (user-select does not inherit past an explicit none).
    expect(css).toContain('div[class*="language-"] *');
    expect(css).toContain("user-select: text !important");
    expect(css).toContain("input, input *");
    expect(css).toContain("textarea, textarea *");
  });

  it("drops invalid selectors instead of invalidating the whole rule", () => {
    instance = createAntiCopy({
      ...STYLE_ONLY,
      excludeSelectors: ["::bad::", ".valid"],
    });
    instance.enable();
    const css = document.head.querySelector(
      "style[data-anti-copy]",
    )!.textContent!;
    expect(css).not.toContain("::bad::");
    expect(css).toContain(".valid");
    expect(css).toContain("input");
  });

  it("removes the stylesheet on disable without residue", () => {
    instance = createAntiCopy(STYLE_ONLY);
    instance.enable();
    instance.disable();
    expect(document.head.querySelectorAll("style[data-anti-copy]").length).toBe(
      0,
    );
  });

  it("two instances own separate style tags and detach independently", () => {
    instance = createAntiCopy(STYLE_ONLY);
    second = createAntiCopy(STYLE_ONLY);
    instance.enable();
    second.enable();
    expect(document.head.querySelectorAll("style[data-anti-copy]").length).toBe(
      2,
    );
    instance.disable();
    // The second instance's protection must survive the first's teardown.
    expect(document.head.querySelectorAll("style[data-anti-copy]").length).toBe(
      1,
    );
  });

  it("blocks selectstart outside editable and excluded regions", () => {
    document.body.innerHTML =
      '<div class="allowed" id="ok">x</div><p id="p">y</p><input id="i" />';
    instance = createAntiCopy({
      ...STYLE_ONLY,
      excludeSelectors: [".allowed"],
    });
    instance.enable();

    const blocked = new Event("selectstart", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("p")!.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    const excluded = new Event("selectstart", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("ok")!.dispatchEvent(excluded);
    expect(excluded.defaultPrevented).toBe(false);

    const editable = new Event("selectstart", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("i")!.dispatchEvent(editable);
    expect(editable.defaultPrevented).toBe(false);
  });

  it("replace mode leaves selection possible by default", () => {
    instance = createAntiCopy({ mode: "replace" });
    instance.enable();
    // selectStyle defaults off in replace mode: no user-select stylesheet…
    expect(document.head.querySelector("style[data-anti-copy]")).toBeNull();
    // …and selectstart is not intercepted.
    const event = new Event("selectstart", {
      bubbles: true,
      cancelable: true,
    });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });
});
