import { describe, expect, it } from "vitest";
import {
  normalizeCategoryLabel,
  normalizeRegistryOrderRecord,
  resolveDropCategoryFromPointerY,
} from "./utils";
import { CATEGORY_DROP_STRIP_PX } from "./constants";

function mockRect(top: number, bottom: number): DOMRect {
  const height = bottom - top;
  return {
    top,
    bottom,
    left: 0,
    right: 100,
    width: 100,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

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

describe("resolveDropCategoryFromPointerY", () => {
  const hosts = [
    { label: "A", rect: mockRect(100, 200) },
    { label: "B", rect: mockRect(208, 308) },
  ];
  const strip = CATEGORY_DROP_STRIP_PX;

  it("returns host label when pointer is inside a category block", () => {
    expect(resolveDropCategoryFromPointerY(150, hosts, strip)).toBe("A");
    expect(resolveDropCategoryFromPointerY(250, hosts, strip)).toBe("B");
  });

  it("snaps gap upper half to upper category and lower half to lower", () => {
    const gapMid = (200 + 208) / 2;
    expect(resolveDropCategoryFromPointerY(gapMid - 1, hosts, strip)).toBe("A");
    expect(resolveDropCategoryFromPointerY(gapMid + 1, hosts, strip)).toBe("B");
  });

  it("returns null when there are no category hosts", () => {
    expect(resolveDropCategoryFromPointerY(150, [], strip)).toBeNull();
  });

  it("snaps above first block to the first category", () => {
    expect(resolveDropCategoryFromPointerY(50, hosts, strip)).toBe("A");
  });
});
