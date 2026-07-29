import { afterEach, describe, expect, it, vi } from "vitest";
import { createAntiCopy, type AntiCopyInstance } from "@/core";

let instance: AntiCopyInstance | null = null;

afterEach(() => {
  instance?.destroy();
  instance = null;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

function fireCopy(target: EventTarget = document.body, type = "copy") {
  const event = new Event(type, { bubbles: true, cancelable: true });
  const setData = vi.fn();
  Object.defineProperty(event, "clipboardData", { value: { setData } });
  target.dispatchEvent(event);
  return { event, setData };
}

function stubSelection(text: string, container?: Node) {
  const selection = {
    toString: () => text,
    isCollapsed: text.length === 0,
    rangeCount: container ? 1 : 0,
    getRangeAt: () => ({ commonAncestorContainer: container }),
  };
  vi.spyOn(window, "getSelection").mockReturnValue(
    selection as unknown as Selection,
  );
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
    instance = createAntiCopy({ mode: "replace", replaceText: "© notice" });
    instance.enable();
    const { event, setData } = fireCopy();
    expect(setData).toHaveBeenCalledWith("text/plain", "© notice");
    expect(setData).toHaveBeenCalledWith("text/html", "© notice");
    expect(event.defaultPrevented).toBe(true);
  });

  it("replaceText function receives the real selection and its result is written", () => {
    stubSelection("secret paragraph");
    const replaceText = vi.fn((sel: string) => `notice for ${sel}`);
    instance = createAntiCopy({ mode: "replace", replaceText });
    instance.enable();
    const { setData } = fireCopy();
    expect(replaceText).toHaveBeenCalledWith("secret paragraph");
    expect(setData).toHaveBeenCalledWith(
      "text/plain",
      "notice for secret paragraph",
    );
  });

  it("escapes the html clipboard flavor", () => {
    instance = createAntiCopy({ mode: "replace", replaceText: '<b>&"x"</b>' });
    instance.enable();
    const { setData } = fireCopy();
    expect(setData).toHaveBeenCalledWith("text/plain", '<b>&"x"</b>');
    expect(setData).toHaveBeenCalledWith(
      "text/html",
      "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;",
    );
  });

  it("editable controls keep native copy behavior", () => {
    document.body.innerHTML = "<input id='i' />";
    instance = createAntiCopy({ selectStyle: false });
    instance.enable();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { event } = fireCopy(document.getElementById("i")!);
    expect(event.defaultPrevented).toBe(false);
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

  it("a selection fully inside an excluded region is allowed", () => {
    document.body.innerHTML =
      '<div class="allowed"><p id="a">x</p></div><p id="b">y</p>';
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    stubSelection("x", document.querySelector(".allowed")!);
    instance = createAntiCopy({
      excludeSelectors: [".allowed"],
      selectStyle: false,
    });
    instance.enable();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { event } = fireCopy(document.getElementById("a")!);
    expect(event.defaultPrevented).toBe(false);
  });

  it("a selection spanning excluded and protected regions is blocked", () => {
    document.body.innerHTML =
      '<div class="allowed"><p id="a">x</p></div><p id="b">y</p>';
    // Selection starts inside .allowed but extends past it: the common
    // ancestor is <body>, so a target-only check would leak content.
    stubSelection("xy", document.body);
    instance = createAntiCopy({
      excludeSelectors: [".allowed"],
      selectStyle: false,
    });
    instance.enable();
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const { event } = fireCopy(document.getElementById("a")!);
    expect(event.defaultPrevented).toBe(true);
  });

  it("cut is intercepted and reported", () => {
    const onViolation = vi.fn();
    instance = createAntiCopy({ selectStyle: false, onViolation });
    instance.enable();
    const { event } = fireCopy(document.body, "cut");
    expect(event.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "cut" }),
    );
  });

  it("dragstart is blocked outside excluded regions and reported", () => {
    document.body.innerHTML =
      '<div class="allowed" id="ok">x</div><p id="p">y</p>';
    const onViolation = vi.fn();
    instance = createAntiCopy({
      excludeSelectors: [".allowed"],
      selectStyle: false,
      onViolation,
    });
    instance.enable();

    const blocked = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("p")?.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);
    expect(onViolation).toHaveBeenCalledWith(
      expect.objectContaining({ type: "drag" }),
    );

    const allowed = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
    document.getElementById("ok")?.dispatchEvent(allowed);
    expect(allowed.defaultPrevented).toBe(false);
  });

  it("a leftover selection in an excluded region does not exempt dragging protected content", () => {
    document.body.innerHTML =
      '<div class="allowed" id="ok">code</div><img id="img" />';
    // Selection lives entirely inside the excluded region…
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    stubSelection("code", document.querySelector(".allowed")!);
    instance = createAntiCopy({
      excludeSelectors: [".allowed"],
      selectStyle: false,
    });
    instance.enable();
    // …but the dragged node is protected content: must stay blocked.
    const event = new Event("dragstart", { bubbles: true, cancelable: true });
    document.getElementById("img")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
