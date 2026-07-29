import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "../src/core/index";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
  document.body.innerHTML = "";
});

function fireContextmenu(target: EventTarget): Event {
  const event = new Event("contextmenu", { bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
}

describe("contextmenu", () => {
  it("suppresses the context menu and reports the violation", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    const event = fireContextmenu(document.body);
    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "contextmenu" }),
    );
  });

  it("keeps the native menu inside editable controls", () => {
    document.body.innerHTML =
      "<input id='i' /><div contenteditable='true' id='e'>x</div>";
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireContextmenu(document.getElementById("i")!).defaultPrevented,
    ).toBe(false);
    expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireContextmenu(document.getElementById("e")!).defaultPrevented,
    ).toBe(false);
  });

  it("keeps the native menu inside excluded regions", () => {
    document.body.innerHTML = '<div class="allowed"><p id="p">x</p></div>';
    instance = createAntiCopy({
      selectStyle: false,
      excludeSelectors: [".allowed"],
    });
    instance.enable();
    expect(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      fireContextmenu(document.getElementById("p")!).defaultPrevented,
    ).toBe(false);
  });

  it("does not attach when contextmenu is disabled", () => {
    instance = createAntiCopy({ selectStyle: false, contextmenu: false });
    instance.enable();
    expect(fireContextmenu(document.body).defaultPrevented).toBe(false);
  });
});
