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

  it("uses the physical key so non-Latin layouts cannot bypass", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    // Cyrillic layout: e.key is "с" but the physical key is KeyC.
    expect(
      fireKey({ key: "с", code: "KeyC", ctrlKey: true }).defaultPrevented,
    ).toBe(true);
    // macOS Option dead key: e.key is "Dead" but the physical key is KeyI.
    expect(
      fireKey({ key: "Dead", code: "KeyI", metaKey: true, altKey: true })
        .defaultPrevented,
    ).toBe(true);
  });

  it("matches e.key too, so remapped Latin layouts cannot bypass either", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    // AZERTY: pressing the "A" keycap reports e.key "a" on physical KeyQ.
    expect(
      fireKey({ key: "a", code: "KeyQ", ctrlKey: true }).defaultPrevented,
    ).toBe(true);
    // Dvorak: pressing "I" for DevTools reports e.key "i" on physical KeyG.
    expect(
      fireKey({ key: "i", code: "KeyG", ctrlKey: true, shiftKey: true })
        .defaultPrevented,
    ).toBe(true);
  });

  it("lets Ctrl+C and Ctrl+Insert through in replace mode so the copy event fires", () => {
    instance = createAntiCopy({ mode: "replace" });
    instance.enable();
    expect(fireKey({ key: "c", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(fireKey({ key: "Insert", ctrlKey: true }).defaultPrevented).toBe(
      false,
    );
    // Ctrl+X and Ctrl+A remain blocked in replace mode.
    expect(fireKey({ key: "x", ctrlKey: true }).defaultPrevented).toBe(true);
  });

  it("blocks Ctrl+Insert in block mode", () => {
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    expect(fireKey({ key: "Insert", ctrlKey: true }).defaultPrevented).toBe(
      true,
    );
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

  it("blocks the macOS view-source shortcut Cmd+Opt+U", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    expect(
      fireKey({ key: "u", metaKey: true, altKey: true }).defaultPrevented,
    ).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "keyboard", key: "Cmd+Opt+U" }),
    );
  });

  it("blocks Ctrl+S and Ctrl+P even inside editable controls", () => {
    document.body.innerHTML = "<input id='i' />";
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    const input = document.getElementById("i")!;
    expect(fireKey({ key: "s", ctrlKey: true }, input).defaultPrevented).toBe(
      true,
    );
    expect(fireKey({ key: "p", ctrlKey: true }, input).defaultPrevented).toBe(
      true,
    );
  });

  it("does not block Ctrl+P/Ctrl+S when print protection is off", () => {
    instance = createAntiCopy({ selectStyle: false, print: false });
    instance.enable();
    expect(fireKey({ key: "p", ctrlKey: true }).defaultPrevented).toBe(false);
    expect(fireKey({ key: "s", ctrlKey: true }).defaultPrevented).toBe(false);
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
