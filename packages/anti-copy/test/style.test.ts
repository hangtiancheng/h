import { afterEach, describe, expect, it } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
});

describe("style injection", () => {
  it("injects user-select rules with exclusions re-enabled", () => {
    instance = createAntiCopy({
      copy: false,
      keyboard: false,
      contextmenu: false,
      excludeSelectors: ['div[class*="language-"]'],
    });
    instance.enable();
    const style = document.head.querySelector("style[data-anti-copy]");
    expect(style).not.toBeNull();
    const css = style!.textContent!;
    expect(css).toContain("user-select: none");
    expect(css).toContain('div[class*="language-"]');
    expect(css).toContain("user-select: text");
    expect(css).toContain("input");
  });

  it("removes the stylesheet on disable without residue", () => {
    instance = createAntiCopy({
      copy: false,
      keyboard: false,
      contextmenu: false,
    });
    instance.enable();
    instance.disable();
    expect(document.head.querySelectorAll("style[data-anti-copy]").length).toBe(
      0,
    );
  });
});
