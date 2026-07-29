import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
  document.body.innerHTML = "";
});

function fireCopy(target: EventTarget = document.body) {
  const event = new Event("copy", { bubbles: true, cancelable: true });
  const setData = vi.fn();
  Object.defineProperty(event, "clipboardData", { value: { setData } });
  target.dispatchEvent(event);
  return { event, setData };
}

describe("clipboard", () => {
  it("block mode prevents the copy", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    const { event, setData } = fireCopy();
    expect(event.defaultPrevented).toBe(true);
    expect(setData).not.toHaveBeenCalled();
  });

  it("replace mode writes the replacement text and prevents default", () => {
    instance = createAntiCopy({
      mode: "replace",
      replaceText: "© notice",
      selectStyle: false,
    });
    instance.enable();
    const { event, setData } = fireCopy();
    expect(setData).toHaveBeenCalledWith("text/plain", "© notice");
    expect(setData).toHaveBeenCalledWith("text/html", "© notice");
    expect(event.defaultPrevented).toBe(true);
  });

  it("replaceText function receives the current selection", () => {
    const replaceText = vi.fn(() => "out");
    instance = createAntiCopy({
      mode: "replace",
      replaceText,
      selectStyle: false,
    });
    instance.enable();
    fireCopy();
    expect(replaceText).toHaveBeenCalledWith(expect.any(String));
  });

  it("excluded regions are not intercepted", () => {
    document.body.innerHTML =
      '<div class="language-ts"><code id="c">x</code></div>';
    instance = createAntiCopy({
      excludeSelectors: ['div[class*="language-"]'],
      selectStyle: false,
    });
    instance.enable();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { event } = fireCopy(document.getElementById("c")!);
    expect(event.defaultPrevented).toBe(false);
  });

  it("cut is intercepted and reported", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    const event = new Event("cut", { bubbles: true, cancelable: true });
    document.body.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cut" }),
    );
  });
});
