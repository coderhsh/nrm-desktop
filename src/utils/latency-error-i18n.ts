/**
 * 将测速接口返回的错误文案映射为当前界面语言，并限制长度以利侧栏与 Toast 展示。
 *
 * @param t - `useI18n` 的翻译函数
 * @param error - 后端 `LatencyResult.error` 或空
 * @param maxLen - 非匹配原文时的最大字符数（超出加省略号）
 */
export function formatLatencyErrorMessage(
  t: (key: string, params?: Record<string, string | number>) => string,
  error: string | null | undefined,
  maxLen = 18,
): string {
  const raw = (error ?? "").trim();
  if (!raw) return t("speedTest.notTested");
  if (raw === "超时") return t("speedTest.timeout");
  if (raw === "连接失败") return t("speedTest.connectFail");
  const http = /^HTTP (\d{3})$/.exec(raw);
  if (http) return t("speedTest.httpErr", { code: http[1] });
  if (raw.startsWith("请求错误:")) return t("speedTest.requestFail");
  if (raw.length > maxLen) return `${raw.slice(0, Math.max(0, maxLen - 1))}…`;
  return raw;
}

/**
 * 测速异常（invoke 抛错等）的简短展示用字符串。
 */
export function truncateSpeedTestRunError(detail: string, maxLen = 26): string {
  const s = detail.trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}
