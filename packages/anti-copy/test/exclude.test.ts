import { afterEach, describe, expect, it } from "vitest";
import {
  escapeHtml,
  isEditable,
  isExcluded,
  isSelectionExcluded,
} from "../src/core/utils";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("isExcluded", () => {
  it("matches an element inside an excluded region", () => {
    document.body.innerHTML =
      '<div class="language-ts"><code id="c">x</code></div>';
    expect(
      isExcluded(document.getElementById("c"), ['div[class*="language-"]']),
    ).toBe(true);
  });

  it("falls back to the parent element for text nodes", () => {
    document.body.innerHTML = '<div class="skip">text</div>';
    const textNode = document.querySelector(".skip")!.firstChild;
    expect(isExcluded(textNode, [".skip"])).toBe(true);
  });

  it("returns false for document, null and non-matching elements", () => {
    expect(isExcluded(document, [".skip"])).toBe(false);
    expect(isExcluded(null, [".skip"])).toBe(false);
    expect(isExcluded(document.body, [".skip"])).toBe(false);
  });

  it("tolerates invalid selectors", () => {
    expect(() => isExcluded(document.body, ["::bad::"])).not.toThrow();
    expect(isExcluded(document.body, ["::bad::"])).toBe(false);
    // A valid selector after an invalid one must still match.
    document.body.innerHTML = '<div class="skip" id="s">x</div>';
    expect(isExcluded(document.getElementById("s"), ["::bad::", ".skip"])).toBe(
      true,
    );
  });

  it("walks up through open shadow roots to the host", () => {
    document.body.innerHTML = '<div class="skip" id="host"></div>';
    const host = document.getElementById("host")!;
    const root = host.attachShadow({ mode: "open" });
    const inner = document.createElement("span");
    root.appendChild(inner);
    expect(isExcluded(inner, [".skip"])).toBe(true);
    expect(isExcluded(inner, [".other"])).toBe(false);
  });
});

describe("isEditable", () => {
  it("recognizes inputs, textareas and contenteditable hosts", () => {
    document.body.innerHTML =
      "<input id='i' /><textarea id='t'></textarea><div contenteditable='true'><span id='s'>x</span></div>";
    expect(isEditable(document.getElementById("i"))).toBe(true);
    expect(isEditable(document.getElementById("t"))).toBe(true);
    expect(isEditable(document.getElementById("s"))).toBe(true);
    expect(isEditable(document.body)).toBe(false);
    expect(isEditable(null)).toBe(false);
  });

  it("treats the contenteditable value as case-insensitive and supports plaintext-only", () => {
    document.body.innerHTML =
      "<div contenteditable='TRUE' id='u'>x</div>" +
      "<div contenteditable='plaintext-only' id='p'>x</div>" +
      "<div contenteditable='' id='e'>x</div>" +
      "<div contenteditable='false' id='f'>x</div>";
    expect(isEditable(document.getElementById("u"))).toBe(true);
    expect(isEditable(document.getElementById("p"))).toBe(true);
    expect(isEditable(document.getElementById("e"))).toBe(true);
    expect(isEditable(document.getElementById("f"))).toBe(false);
  });

  it("recognizes inputs inside open shadow roots", () => {
    document.body.innerHTML = "<div id='host'></div>";
    const root = document
      .getElementById("host")!
      .attachShadow({ mode: "open" });
    const input = document.createElement("input");
    root.appendChild(input);
    expect(isEditable(input)).toBe(true);
  });
});

describe("isSelectionExcluded", () => {
  function stubSelection(container: Node | null) {
    return {
      toString: () => "x",
      isCollapsed: false,
      rangeCount: container ? 1 : 0,
      getRangeAt: () => ({ commonAncestorContainer: container }),
    } as unknown as Selection;
  }

  it("returns null without selectors or without a usable selection", () => {
    expect(isSelectionExcluded(document, [])).toBe(null);
  });

  it("judges the selection by its common ancestor", () => {
    document.body.innerHTML = '<div class="skip" id="d">x</div>';
    const doc = {
      defaultView: {
        getSelection: () => stubSelection(document.getElementById("d")),
      },
    } as unknown as Document;
    expect(isSelectionExcluded(doc, [".skip"])).toBe(true);

    const spanning = {
      defaultView: { getSelection: () => stubSelection(document.body) },
    } as unknown as Document;
    expect(isSelectionExcluded(spanning, [".skip"])).toBe(false);
  });
});

describe("escapeHtml", () => {
  it("escapes markup-significant characters", () => {
    expect(escapeHtml('<b>&"x"</b>')).toBe(
      "&lt;b&gt;&amp;&quot;x&quot;&lt;/b&gt;",
    );
  });
});
