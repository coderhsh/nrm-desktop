/**
 * 将 Tauri `invoke` 等抛出的后端错误文案映射为当前界面语言（与 `useI18n` 的 `t` 配套）。
 * 未知文案原样返回（可能为系统 I/O 英文信息）。
 */
export type TranslateFn = (
  key: string,
  params?: Record<string, string | number>,
) => string;

export function formatInvokeErrorMessage(t: TranslateFn, error: unknown): string {
  const raw = String(error ?? "").trim();
  if (!raw) return t("backend.unknownError");

  const tryPrefix = (prefix: string, key: string) => {
    if (!raw.startsWith(prefix)) return null;
    const detail = raw.slice(prefix.length).trim();
    return t(key, { detail: detail || t("backend.unknownError") });
  };

  const mNotFound = /^未找到源:\s*(.+)$/.exec(raw);
  if (mNotFound) return t("backend.registryNotFoundWithName", { name: mNotFound[1]!.trim() });

  const mNameConflict = /^源名称 '(.+)' 与预设源冲突$/.exec(raw);
  if (mNameConflict) return t("backend.importNamePresetConflict", { name: mNameConflict[1]! });

  const mUrlConflict = /^URL '(.+)' 与预设源冲突$/.exec(raw);
  if (mUrlConflict) return t("backend.importUrlPresetConflict", { url: mUrlConflict[1]! });

  const prefixed =
    tryPrefix("备份失败:", "backend.npmrcBackupFailed") ??
    tryPrefix("设置失败:", "backend.npmrcSetFailed") ??
    tryPrefix("JSON 解析失败:", "backend.jsonParseFailed") ??
    tryPrefix("写入文件失败:", "backend.fileWriteFailed") ??
    tryPrefix("读取文件失败:", "backend.fileReadFailed") ??
    tryPrefix("隐藏主窗口失败:", "backend.hideWindowFailed") ??
    tryPrefix("保存语言设置失败:", "backend.saveLanguageFailed") ??
    tryPrefix("创建 HTTP 客户端失败:", "backend.httpClientCreateFailed");
  if (prefixed) return prefixed;

  const exact: Record<string, string> = {
    该名称已存在: "backend.nameAlreadyExists",
    "该 URL 已存在": "backend.urlAlreadyExists",
    "与预设源名称或 URL 冲突": "backend.presetNameOrUrlConflict",
    未找到该源: "backend.registryNotFound",
    "URL 必须以 http:// 或 https:// 开头": "backend.urlMustHttpHttps",
    不支持的语言: "backend.unsupportedLanguage",
    无可用源: "backend.noRegistriesAvailable",
    备份文件不存在: "backend.backupFileNotFound",
    "未找到主窗口": "backend.mainWindowNotFound",
    "URL 不能为空": "backend.urlEmpty",
  };
  const key = exact[raw];
  if (key) return t(key);

  return raw;
}
