import { describe, expect, it } from "vitest";
import {
  normalizeCategoryLabel,
  normalizeRegistryOrderRecord,
} from "./utils";

describe("normalizeRegistryOrderRecord", () => {
  it("returns empty object for invalid input", () => {
    expect(normalizeRegistryOrderRecord(null)).toEqual({});
    expect(normalizeRegistryOrderRecord([])).toEqual({});
    expect(normalizeRegistryOrderRecord("bad")).toEqual({});
  });

  it("keeps only string array values", () => {
    expect(
      normalizeRegistryOrderRecord({
        default: ["a", 1, "b"],
        other: "x",
      }),
    ).toEqual({ default: ["a", "b"] });
  });
});

describe("normalizeCategoryLabel", () => {
  it("trims and truncates labels", () => {
    expect(normalizeCategoryLabel("  work  ")).toBe("work");
    expect(normalizeCategoryLabel(null)).toBe("");
    expect(normalizeCategoryLabel("x".repeat(40)).length).toBe(20);
  });
});
