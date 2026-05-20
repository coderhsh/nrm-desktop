import { describe, expect, it } from "vitest";
import { formatInvokeErrorMessage } from "./invoke-error-i18n";

const t = (key: string, params?: Record<string, string | number>) => {
  if (params) {
    return `${key}:${JSON.stringify(params)}`;
  }
  return key;
};

describe("formatInvokeErrorMessage", () => {
  it("maps empty errors to unknownError", () => {
    expect(formatInvokeErrorMessage(t, "")).toBe("backend.unknownError");
    expect(formatInvokeErrorMessage(t, null)).toBe("backend.unknownError");
  });

  it("maps exact backend messages to i18n keys", () => {
    expect(formatInvokeErrorMessage(t, "该名称已存在")).toBe("backend.nameAlreadyExists");
    expect(formatInvokeErrorMessage(t, "URL 不能为空")).toBe("backend.urlEmpty");
  });

  it("maps prefixed errors with detail", () => {
    expect(formatInvokeErrorMessage(t, "备份失败: disk full")).toBe(
      'backend.npmrcBackupFailed:{"detail":"disk full"}',
    );
  });

  it("maps registry not found pattern", () => {
    expect(formatInvokeErrorMessage(t, "未找到源: npm")).toBe(
      'backend.registryNotFoundWithName:{"name":"npm"}',
    );
  });

  it("returns unknown raw messages as-is", () => {
    expect(formatInvokeErrorMessage(t, "ENOENT: no such file")).toBe(
      "ENOENT: no such file",
    );
  });
});
