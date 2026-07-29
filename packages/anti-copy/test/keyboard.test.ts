import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
  document.body.innerHTML = "";
});

function fireKey(
  init: KeyboardEventInit,
  target: EventTarget = document.body,
): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

describe("keyboard", () => {
  it("blocks Ctrl+C and Cmd+C in block mode", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    expect(fireKey({ key: "c", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(fireKey({ key: "c", metaKey: true }).defaultPrevented).toBe(true);
    expect(fireKey({ key: "a", ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("lets Ctrl+C through in replace mode so the copy event fires", () => {
    instance = createAntiCopy({ mode: "replace", selectStyle: false });
    instance.enable();
    expect(fireKey({ key: "c", ctrlKey: true }).defaultPrevented).toBe(false);
    // Ctrl+X and Ctrl+A remain blocked in replace mode.
    expect(fireKey({ key: "x", ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("blocks DevTools shortcuts and reports the combo", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    expect(fireKey({ key: "F12" }).defaultPrevented).toBe(true);
    expect(
      fireKey({ key: "I", ctrlKey: true, shiftKey: true }).defaultPrevented,
    ).toBe(true);
    expect(fireKey({ key: "u", ctrlKey: true }).defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "keyboard", key: "Ctrl+Shift+I" }),
    );
  });

  it("allows Ctrl+A inside editable controls", () => {
    document.body.innerHTML = "<input id='i' />";
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    const input = document.getElementById("i")!;
    expect(fireKey({ key: "a", ctrlKey: true }, input).defaultPrevented).toBe(
      false,
    );
  });

  it("ignores plain keys without modifiers", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    expect(fireKey({ key: "c" }).defaultPrevented).toBe(false);
  });
});
