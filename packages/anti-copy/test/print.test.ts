import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
});

describe("print protection", () => {
  it("injects an @media print stylesheet and removes it on disable", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    const style = document.head.querySelector("style[data-anti-copy-print]");
    expect(style).not.toBeNull();
    expect(style?.textContent).toContain("@media print");
    expect(style?.textContent).toContain("display: none !important");
    instance.disable();
    expect(
      document.head.querySelector("style[data-anti-copy-print]"),
    ).toBeNull();
  });

  it("reports print attempts via beforeprint", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    window.dispatchEvent(new Event("beforeprint"));
    expect(onViolation).toHaveBeenCalledWith({ type: "print" });
  });

  it("does nothing when print is disabled", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({
      selectStyle: false,
      print: false,
      onViolation,
    });
    instance.enable();
    expect(
      document.head.querySelector("style[data-anti-copy-print]"),
    ).toBeNull();
    window.dispatchEvent(new Event("beforeprint"));
    expect(onViolation).not.toHaveBeenCalled();
  });
});
