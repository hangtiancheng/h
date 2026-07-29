import { describe, expect, it } from "vitest";
import { isPathExcluded } from "../src/swifty-docs/index";

describe("isPathExcluded", () => {
  it("matches exact paths", () => {
    expect(isPathExcluded("/playground", ["/playground"])).toBe(true);
    expect(isPathExcluded("/docs", ["/playground"])).toBe(false);
  });

  it("ignores trailing slashes on either side", () => {
    expect(isPathExcluded("/playground", ["/playground/"])).toBe(true);
    expect(isPathExcluded("/playground/", ["/playground"])).toBe(true);
    expect(isPathExcluded("/playground/", ["/playground/"])).toBe(true);
  });

  it("matches sub-paths by segment prefix only", () => {
    expect(isPathExcluded("/playground/demo", ["/playground"])).toBe(true);
    // A plain string prefix must not match unrelated segments.
    expect(isPathExcluded("/playground-notes", ["/playground"])).toBe(false);
  });

  it("treats the root pattern as exact", () => {
    expect(isPathExcluded("/", ["/"])).toBe(true);
    expect(isPathExcluded("/docs", ["/"])).toBe(false);
  });

  it("tests RegExp patterns against the full path", () => {
    expect(isPathExcluded("/de/docs", [/^\/(de|fr)\//])).toBe(true);
    expect(isPathExcluded("/en/docs", [/^\/(de|fr)\//])).toBe(false);
  });
});
