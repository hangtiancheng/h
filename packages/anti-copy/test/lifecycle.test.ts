import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy } from "../src/core/index";

afterEach(() => {
  vi.unstubAllGlobals();
});

function dispatchCopy(): Event {
  const event = new Event("copy", { bubbles: true, cancelable: true });
  document.body.dispatchEvent(event);
  return event;
}

describe("lifecycle", () => {
  it("enable is idempotent (single style tag, listener registered once)", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const instance = createAntiCopy();
    instance.enable();
    const callsAfterFirst = addSpy.mock.calls.length;
    instance.enable();
    expect(addSpy.mock.calls.length).toBe(callsAfterFirst);
    expect(document.head.querySelectorAll("style[data-anti-copy]").length).toBe(
      1,
    );
    instance.destroy();
    addSpy.mockRestore();
  });

  it("disable removes protection and injected styles", () => {
    const instance = createAntiCopy();
    instance.enable();
    instance.disable();
    expect(document.head.querySelector("style[data-anti-copy]")).toBeNull();
    expect(
      document.head.querySelector("style[data-anti-copy-print]"),
    ).toBeNull();
    const event = dispatchCopy();
    expect(event.defaultPrevented).toBe(false);
    expect(instance.isEnabled()).toBe(false);
  });

  it("destroy retires the instance; enable becomes a no-op", () => {
    const instance = createAntiCopy();
    instance.enable();
    instance.destroy();
    instance.enable();
    expect(instance.isEnabled()).toBe(false);
    expect(dispatchCopy().defaultPrevented).toBe(false);
  });

  it("update after destroy is a no-op", () => {
    const onViolation = vi.fn();
    const instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    instance.destroy();
    instance.update({ onViolation });
    expect(instance.isEnabled()).toBe(false);
    dispatchCopy();
    expect(onViolation).not.toHaveBeenCalled();
  });

  it("update re-applies protection with merged options", () => {
    const onViolation = vi.fn();
    const instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    instance.update({ onViolation });
    expect(instance.isEnabled()).toBe(true);
    dispatchCopy();
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "copy" }),
    );
    instance.destroy();
  });

  it("update keeps the disabled state", () => {
    const instance = createAntiCopy({ selectStyle: false });
    instance.update({ mode: "replace" });
    expect(instance.isEnabled()).toBe(false);
    expect(dispatchCopy().defaultPrevented).toBe(false);
    instance.destroy();
  });

  it("returns an inert no-op instance outside the browser", () => {
    vi.stubGlobal("document", undefined);
    const instance = createAntiCopy();
    expect(() => {
      instance.enable();
      instance.update({ mode: "replace" });
      instance.disable();
      instance.destroy();
    }).not.toThrow();
    expect(instance.isEnabled()).toBe(false);
  });
});
