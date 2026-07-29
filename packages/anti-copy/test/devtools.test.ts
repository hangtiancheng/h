import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

function setWindowMetrics(outerWidth: number, innerWidth: number) {
  Object.defineProperty(window, "outerWidth", {
    value: outerWidth,
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: innerWidth,
    configurable: true,
  });
  Object.defineProperty(window, "outerHeight", {
    value: 900,
    configurable: true,
  });
  Object.defineProperty(window, "innerHeight", {
    value: 900,
    configurable: true,
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  setWindowMetrics(1200, 1200);
});

afterEach(() => {
  instance?.destroy();
  instance = null;
  vi.useRealTimers();
});

describe("devtools detector", () => {
  it("fires once per closed-to-open transition", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({
      copy: false,
      keyboard: false,
      contextmenu: false,
      selectStyle: false,
      devtools: { intervalMs: 100, threshold: 170 },
      onViolation,
    });
    instance.enable();

    vi.advanceTimersByTime(300);
    expect(onViolation).not.toHaveBeenCalled();

    setWindowMetrics(1200, 900);
    vi.advanceTimersByTime(300);
    expect(onViolation).toHaveBeenCalledTimes(1);
    expect(onViolation).toHaveBeenCalledWith({ type: "devtools" });

    // Still open: no repeated notifications.
    vi.advanceTimersByTime(500);
    expect(onViolation).toHaveBeenCalledTimes(1);

    // Close, then reopen: fires again.
    setWindowMetrics(1200, 1200);
    vi.advanceTimersByTime(200);
    setWindowMetrics(1200, 900);
    vi.advanceTimersByTime(200);
    expect(onViolation).toHaveBeenCalledTimes(2);
  });

  it("stops polling after disable", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({
      copy: false,
      keyboard: false,
      contextmenu: false,
      selectStyle: false,
      devtools: { intervalMs: 100 },
      onViolation,
    });
    instance.enable();
    instance.disable();
    setWindowMetrics(1200, 900);
    vi.advanceTimersByTime(1000);
    expect(onViolation).not.toHaveBeenCalled();
  });
});
