import { describe, expect, it } from "vitest";
import { DEFAULT_REPLACE_TEXT, resolveOptions } from "../src/core/options";

describe("resolveOptions", () => {
  it("fills defaults", () => {
    const resolved = resolveOptions();
    expect(resolved.mode).toBe("block");
    expect(resolved.replaceText).toBe(DEFAULT_REPLACE_TEXT);
    expect(resolved.excludeSelectors).toEqual([]);
    expect(resolved.copy).toBe(true);
    expect(resolved.keyboard).toBe(true);
    expect(resolved.contextmenu).toBe(true);
    expect(resolved.selectStyle).toBe(true);
    expect(resolved.print).toBe(true);
    expect(resolved.devtools).toBe(false);
  });

  it("defaults selectStyle off in replace mode so selection stays possible", () => {
    expect(resolveOptions({ mode: "replace" }).selectStyle).toBe(false);
    expect(
      resolveOptions({ mode: "replace", selectStyle: true }).selectStyle,
    ).toBe(true);
  });

  it("expands devtools: true into full defaults", () => {
    expect(resolveOptions({ devtools: true }).devtools).toEqual({
      intervalMs: 1000,
      threshold: 170,
    });
  });

  it("backfills partial devtools objects", () => {
    expect(resolveOptions({ devtools: { threshold: 300 } }).devtools).toEqual({
      intervalMs: 1000,
      threshold: 300,
    });
  });
});
