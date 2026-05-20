import { describe, expect, it } from "vitest";
import { latencyBarColor } from "./latency-bar-color";

describe("latencyBarColor", () => {
  it("returns gray for null latency", () => {
    expect(latencyBarColor(null)).toBe("#8e8e93");
  });

  it("maps latency thresholds to colors", () => {
    expect(latencyBarColor(100)).toBe("#34c759");
    expect(latencyBarColor(300)).toBe("#30d158");
    expect(latencyBarColor(800)).toBe("#ffcc00");
    expect(latencyBarColor(2000)).toBe("#ff9500");
    expect(latencyBarColor(5000)).toBe("#ff3b30");
  });
});
