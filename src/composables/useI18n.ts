import { computed } from "vue";
import { useLocalStorage } from "@vueuse/core";

export type AppLanguage = "zh-CN" | "en";

interface LocaleMessages {
  [key: string]: string;
}

const messages: Record<AppLanguage, LocaleMessages> = {
  "zh-CN": {
    // common
    "common.save": "保存",
    "common.close": "关闭",
    "common.cancel": "取消",
    "common.export": "导出",
    "common.import": "导入",
    "common.reset": "重置",
    "common.settings": "设置",

    // app
    "app.currentSourceLabel": "当前源：{name}",
    "app.currentSourceUnset": "未设置 registry",
    "app.proxy": "代理",
    "app.exportConfig": "导出配置",
    "app.importConfig": "导入配置",
    "app.resetDefaults": "恢复默认",
    "app.settingsDialogTitle": "设置",
    "app.settings.general": "通用设置",
    "app.settings.data": "数据管理",
    "app.settings.language": "语言",
    "app.settings.theme": "主题",
    "app.settings.themeAuto": "自动",
    "app.settings.themeLight": "浅色",
    "app.settings.themeDark": "深色",
    "app.settings.saveSuccess": "设置已保存",
    "app.settings.switchToZh": "语言已切换为简体中文",
    "app.settings.switchToEn": "Language switched to English",

    // current-source
    "currentSource.title": "当前源",
    "currentSource.unset": "未设置",
    "currentSource.emptyUrl": "暂无 URL",
    "currentSource.copyUrl": "复制 URL",
    "currentSource.inUse": "使用中",
    "currentSource.copySuccess": "URL 已复制",
    "currentSource.copyFailed": "复制失败: {error}",
    "currentSource.openFailed": "打开链接失败: {error}",

    // speed-test
    "speedTest.title": "速度测试",
    "speedTest.lastTested": "上次测试：{count} 个源",
    "speedTest.switchFastest": "切换到最快 ({latency}ms)",
    "speedTest.testAll": "全部测试",
    "speedTest.testing": "测试中...",
    "speedTest.empty": "点击\"全部测试\"开始测速",
    "speedTest.loading": "正在测速，请稍候...",
    "speedTest.failed": "失败",
  },
  en: {
    "common.save": "Save",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.export": "Export",
    "common.import": "Import",
    "common.reset": "Reset",
    "common.settings": "Settings",

    "app.currentSourceLabel": "Current source: {name}",
    "app.currentSourceUnset": "Registry not set",
    "app.proxy": "Proxy",
    "app.exportConfig": "Export config",
    "app.importConfig": "Import config",
    "app.resetDefaults": "Reset defaults",
    "app.settingsDialogTitle": "Settings",
    "app.settings.general": "General",
    "app.settings.data": "Data",
    "app.settings.language": "Language",
    "app.settings.theme": "Theme",
    "app.settings.themeAuto": "Auto",
    "app.settings.themeLight": "Light",
    "app.settings.themeDark": "Dark",
    "app.settings.saveSuccess": "Settings saved",
    "app.settings.switchToZh": "语言已切换为简体中文",
    "app.settings.switchToEn": "Language switched to English",

    "currentSource.title": "Current Source",
    "currentSource.unset": "Not Set",
    "currentSource.emptyUrl": "No URL",
    "currentSource.copyUrl": "Copy URL",
    "currentSource.inUse": "In Use",
    "currentSource.copySuccess": "URL copied",
    "currentSource.copyFailed": "Copy failed: {error}",
    "currentSource.openFailed": "Open link failed: {error}",

    "speedTest.title": "Speed Test",
    "speedTest.lastTested": "Last tested: {count} sources",
    "speedTest.switchFastest": "Switch to fastest ({latency}ms)",
    "speedTest.testAll": "Test All",
    "speedTest.testing": "Testing...",
    "speedTest.empty": "Click \"Test All\" to start",
    "speedTest.loading": "Testing in progress...",
    "speedTest.failed": "Failed",
  },
};

export function useI18n() {
  const language = useLocalStorage<AppLanguage>("nrm-desktop-language", "zh-CN");

  function t(key: string, params?: Record<string, string | number>): string {
    const template = messages[language.value][key] || messages["zh-CN"][key] || key;
    if (!params) return template;
    return Object.entries(params).reduce(
      (result, [paramKey, paramValue]) =>
        result.replace(new RegExp(`\\{${paramKey}\\}`, "g"), String(paramValue)),
      template
    );
  }

  const isEnglish = computed(() => language.value === "en");

  return {
    language,
    isEnglish,
    t,
  };
}
