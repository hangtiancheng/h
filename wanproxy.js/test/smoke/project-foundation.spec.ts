import { describe, expect, it } from "vitest";

import { createVersionLabel, packageName } from "@/index.js";

describe("project foundation", () => {
  it("exports package metadata", () => {
    expect(packageName).toBe("wanproxy-js");
    expect(createVersionLabel("0.0.0")).toBe("wanproxy-js@0.0.0");
  });
});
