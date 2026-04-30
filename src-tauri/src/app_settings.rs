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

pub fn set_language(language: &str) -> io::Result<()> {
    let mut settings = load_settings().unwrap_or_default();
    settings.language = language.to_string();
    save_settings(&settings)
}
