import { describe, expect, it } from "vitest";
import { coerceAppLanguage } from "./useI18n";

describe("coerceAppLanguage", () => {
  it("accepts supported languages", () => {
    expect(coerceAppLanguage("en")).toBe("en");
    expect(coerceAppLanguage("zh-CN")).toBe("zh-CN");
  });

  it("falls back to zh-CN for unknown values", () => {
    expect(coerceAppLanguage("fr")).toBe("zh-CN");
    expect(coerceAppLanguage("")).toBe("zh-CN");
  });
});
