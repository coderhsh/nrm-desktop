use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Default)]
struct AppSettings {
    #[serde(default = "default_language")]
    language: String,
}

fn default_language() -> String {
    "zh-CN".to_string()
}

fn config_dir() -> PathBuf {
    let home = if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home)
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home)
    } else {
        PathBuf::from(".")
    };
    home.join(".nrm-desktop")
}

fn settings_file_path() -> PathBuf {
    config_dir().join("app-settings.json")
}

fn load_settings() -> io::Result<AppSettings> {
    let path = settings_file_path();
    if !path.exists() {
        return Ok(AppSettings::default());
    }
    let content = fs::read_to_string(path)?;
    let parsed: AppSettings = serde_json::from_str(&content).unwrap_or_default();
    Ok(parsed)
}

fn save_settings(settings: &AppSettings) -> io::Result<()> {
    let dir = config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    let content = serde_json::to_string_pretty(settings)?;
    fs::write(settings_file_path(), content)
}

/// 根据操作系统区域设置推断界面语言标签（`zh-CN` 或 `en`），用于首次生成 `app-settings.json`。
fn detect_os_language_tag() -> String {
    let locale = sys_locale::get_locale()
        .unwrap_or_default()
        .to_lowercase();
    if locale.starts_with("zh") {
        "zh-CN".to_string()
    } else {
        "en".to_string()
    }
}

fn load_or_create_language() -> String {
    let path = settings_file_path();
    if !path.exists() {
        let lang = detect_os_language_tag();
        let settings = AppSettings { language: lang.clone() };
        if let Err(e) = save_settings(&settings) {
            eprintln!("[nrm-desktop] 无法写入默认语言设置: {e}");
        }
        return lang;
    }
    load_settings()
        .map(|s| s.language)
        .unwrap_or_else(|_| default_language())
}

pub fn get_language() -> String {
    load_or_create_language()
}

/// 合并未知 npm 源时的主显示名称（随当前界面语言 / `app-settings`）。
pub fn i18n_merged_current_registry_name() -> String {
    match get_language().as_str() {
        "en" => "Current source".to_string(),
        _ => "当前源".to_string(),
    }
}

/// 主机名备选：`自定义·host` / `Custom · host`
pub fn i18n_merged_registry_from_host(host: &str) -> String {
    match get_language().as_str() {
        "en" => format!("Custom · {}", host),
        _ => format!("自定义·{}", host),
    }
}

/// 无法解析主机时的备选标签
pub fn i18n_merged_registry_npmrc_fallback() -> String {
    match get_language().as_str() {
        "en" => "npmrc registry".to_string(),
        _ => "npmrc 源".to_string(),
    }
}

pub fn set_language(language: &str) -> io::Result<()> {
    let mut settings = load_settings().unwrap_or_default();
    settings.language = language.to_string();
    save_settings(&settings)
}

/// 将界面语言重置为当前操作系统区域对应的 `zh-CN` / `en`，并写入配置文件。
pub fn reset_language_to_os_default() -> io::Result<String> {
    let lang = detect_os_language_tag();
    let settings = AppSettings { language: lang.clone() };
    save_settings(&settings)?;
    Ok(lang)
}
