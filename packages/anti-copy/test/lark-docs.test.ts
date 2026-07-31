import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "@lark.js/docs";
import { applyAntiCopy } from "@/docs/lark";

function pushPath(path: string): void {
  window.history.pushState({}, "", path);
}

afterEach(() => {
  vi.restoreAllMocks();
  pushPath("/");
});

describe("applyAntiCopy (lark-docs)", () => {
  it("enables protection immediately for non-excluded paths", () => {
    const handle = applyAntiCopy();
    expect(handle.instance.isEnabled()).toBe(true);
    handle.stop();
  });

  it("stays disabled when the current path is excluded", () => {
    pushPath("/h/lark-docs/playground");
    const handle = applyAntiCopy({
      excludePaths: ["/h/lark-docs/playground"],
    });
    expect(handle.instance.isEnabled()).toBe(false);
    handle.stop();
  });

  it("toggles with router navigation", () => {
    const onSpy = vi.spyOn(Router, "on");
    const handle = applyAntiCopy({ excludePaths: ["/playground"] });
    expect(onSpy).toHaveBeenCalledWith("changed", expect.any(Function));
    const sync = onSpy.mock.calls[0][1] as () => void;

    pushPath("/playground/demo");
    sync();
    expect(handle.instance.isEnabled()).toBe(false);

    pushPath("/docs/guide");
    sync();
    expect(handle.instance.isEnabled()).toBe(true);
    handle.stop();
  });

  it("stop() unsubscribes and destroys the instance", () => {
    const onSpy = vi.spyOn(Router, "on");
    const offSpy = vi.spyOn(Router, "off");
    const handle = applyAntiCopy();
    const sync = onSpy.mock.calls[0][1];

    handle.stop();
    expect(offSpy).toHaveBeenCalledWith("changed", sync);
    expect(handle.instance.isEnabled()).toBe(false);
    // Destroyed instances cannot be re-enabled.
    handle.instance.enable();
    expect(handle.instance.isEnabled()).toBe(false);
  });
});
