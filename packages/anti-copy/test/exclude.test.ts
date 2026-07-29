import { afterEach, describe, expect, it } from "vitest";
import { isEditable, isExcluded } from "../src/core/utils";

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
});
