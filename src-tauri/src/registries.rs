use crate::app_settings;
use crate::models::{default_registries, Registry};
use crate::npmrc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
struct CustomData {
    #[serde(default)]
    registries: Vec<Registry>,
    /// 旧版「预设源 + 自定义源」模型遗留字段，加载时迁移后清空。
    #[serde(default)]
    deleted_presets: Vec<String>,
}

/// Get the config directory for storing custom registries.
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

/// Get the path to the custom registries file.
fn custom_file_path() -> PathBuf {
    config_dir().join("custom.json")
}

/// Ensure the config directory exists.
fn ensure_config_dir() -> io::Result<()> {
    let dir = config_dir();
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(())
}

fn uses_legacy_preset_model(data: &CustomData) -> bool {
    !data.deleted_presets.is_empty()
}

/// 将旧版「虚拟预设 + custom + deleted_presets」合并为单一列表。
fn migrate_from_legacy_preset_model(mut data: CustomData) -> CustomData {
    let defaults = default_registries();
    let mut registries = Vec::new();

    for preset in &defaults {
        if data.deleted_presets.iter().any(|name| name == &preset.name) {
            continue;
        }
        if let Some(custom) = data.registries.iter().find(|r| r.name == preset.name) {
            registries.push(Registry {
                name: custom.name.clone(),
                url: custom.url.clone(),
            });
        } else {
            registries.push(preset.clone());
        }
    }

    for custom in &data.registries {
        if !defaults.iter().any(|d| d.name == custom.name) {
            registries.push(Registry {
                name: custom.name.clone(),
                url: custom.url.clone(),
            });
        }
    }

    data.registries = registries;
    data.deleted_presets.clear();
    data
}

fn normalize_registry_entries(registries: Vec<Registry>) -> Vec<Registry> {
    registries
        .into_iter()
        .map(|r| Registry {
            name: r.name.trim().to_string(),
            url: r.url.trim().to_string(),
        })
        .filter(|r| !r.name.is_empty() && !r.url.is_empty())
        .collect()
}

/// 空列表时写入三个默认源；旧数据则做一次预设模型迁移。
fn normalize_custom_data(mut data: CustomData) -> (CustomData, bool) {
    let mut changed = false;

    if uses_legacy_preset_model(&data) {
        data = migrate_from_legacy_preset_model(data);
        changed = true;
    }

    if data.registries.is_empty() {
        data.registries = default_registries();
        changed = true;
    } else {
        let normalized = normalize_registry_entries(data.registries);
        data.registries = normalized;
    }

    (data, changed)
}

/// Load custom registries from the JSON file.
fn load_custom_data() -> io::Result<CustomData> {
    let path = custom_file_path();
    if !path.exists() {
        let data = CustomData {
            registries: default_registries(),
            deleted_presets: Vec::new(),
        };
        save_custom_data(&data)?;
        return Ok(data);
    }
    let content = fs::read_to_string(&path)?;
    let data: CustomData = serde_json::from_str(&content)?;
    let (data, changed) = normalize_custom_data(data);
    if changed {
        save_custom_data(&data)?;
    }
    Ok(data)
}

/// Load custom registries from the JSON file.
fn load_custom() -> io::Result<Vec<Registry>> {
    Ok(load_custom_data()?.registries)
}

/// Save custom registries to the JSON file.
fn save_custom(registries: &[Registry]) -> io::Result<()> {
    let mut data = load_custom_data()?;
    data.registries = registries.to_vec();
    save_custom_data(&data)
}

/// Save full custom data to the JSON file.
fn save_custom_data(data: &CustomData) -> io::Result<()> {
    ensure_config_dir()?;
    let content = serde_json::to_string_pretty(&data)?;
    fs::write(custom_file_path(), content)?;
    Ok(())
}

/// 与列表/托盘比较 registry URL 时统一规范化（忽略首尾空白与末尾 `/`）。
fn normalize_registry_url_key(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// 从 registry URL 推断用于展示的主机名片段（用于名称冲突时的备选名）。
fn host_hint_from_registry_url(url: &str) -> Option<String> {
    let u = url.trim();
    let rest = u
        .strip_prefix("https://")
        .or_else(|| u.strip_prefix("http://"))?;
    let host_port = rest.split('/').next()?;
    let host = host_port.split(':').next()?;
    if host.is_empty() {
        None
    } else {
        Some(host.to_string())
    }
}

/// 为即将导入的未知当前源生成不与现有列表冲突的名称（主名与备选随 `app_settings` 语言）。
fn pick_name_for_imported_current(all: &[Registry], url: &str) -> String {
    let primary = app_settings::i18n_merged_current_registry_name();
    if !all.iter().any(|r| r.name == primary) {
        return primary;
    }
    let base = host_hint_from_registry_url(url)
        .map(|h| app_settings::i18n_merged_registry_from_host(&h))
        .unwrap_or_else(|| app_settings::i18n_merged_registry_npmrc_fallback());
    if !all.iter().any(|r| r.name == base) {
        return base;
    }
    let mut n = 2u32;
    loop {
        let candidate = format!("{}·{}", base, n);
        if !all.iter().any(|r| r.name == candidate) {
            return candidate;
        }
        n += 1;
    }
}

/// 将「当前 npmrc 中的源」写入列表（供启动时合并）；若 URL 已存在则跳过。
fn insert_merged_current_registry(name: &str, url: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let key = normalize_registry_url_key(url);

    if data
        .registries
        .iter()
        .any(|r| normalize_registry_url_key(&r.url) == key)
    {
        return Ok(());
    }
    if data.registries.iter().any(|r| r.name == name) {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "该名称已存在",
        ));
    }

    data.registries.push(Registry {
        name: name.to_string(),
        url: url.to_string(),
    });
    save_custom_data(&data)
}

/// 启动时：若用户 `.npmrc` 中的 registry 不在当前列表中，则写入配置以便界面与托盘可操作。
pub fn merge_current_npm_registry_if_missing() -> io::Result<()> {
    let Some(raw_url) = npmrc::read_current_registry()? else {
        return Ok(());
    };
    let url = raw_url.trim().to_string();
    if url.is_empty() {
        return Ok(());
    }
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Ok(());
    }
    let key = normalize_registry_url_key(&url);
    let all = get_all()?;
    if all
        .iter()
        .any(|r| normalize_registry_url_key(&r.url) == key)
    {
        return Ok(());
    }
    let name = pick_name_for_imported_current(&all, &url);
    insert_merged_current_registry(name.as_str(), url.as_str())
}

/// Get all registries from persisted list.
pub fn get_all() -> io::Result<Vec<Registry>> {
    Ok(load_custom_data()?.registries)
}

/// Add a registry.
pub fn add(name: &str, url: &str) -> io::Result<()> {
    let mut custom = load_custom()?;

    if custom.iter().any(|r| r.name == name) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
    }

    if custom.iter().any(|r| r.url == url) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该 URL 已存在"));
    }

    custom.push(Registry {
        name: name.to_string(),
        url: url.to_string(),
    });

    save_custom(&custom)
}

/// Delete a registry.
pub fn delete(name: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let len_before = data.registries.len();
    data.registries.retain(|r| r.name != name);

    if data.registries.len() == len_before {
        return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该源"));
    }

    save_custom_data(&data)
}

/// Update a registry.
pub fn update(name: &str, new_name: &str, new_url: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let idx = data
        .registries
        .iter()
        .position(|r| r.name == name)
        .ok_or_else(|| io::Error::new(io::ErrorKind::NotFound, "未找到该源"))?;

    if name != new_name
        && data
            .registries
            .iter()
            .any(|r| r.name == new_name && r.name != name)
    {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
    }

    data.registries[idx].name = new_name.to_string();
    data.registries[idx].url = new_url.to_string();

    save_custom_data(&data)
}

/// Import and replace registries.
pub fn import_custom(imported: &[Registry]) -> io::Result<()> {
    let mut cleaned: Vec<Registry> = imported
        .iter()
        .map(|r| Registry {
            name: r.name.trim().to_string(),
            url: r.url.trim().to_string(),
        })
        .filter(|r| !r.name.is_empty() && !r.url.is_empty())
        .collect();
    cleaned.dedup_by(|a, b| a.name == b.name);

    let data = CustomData {
        registries: cleaned,
        deleted_presets: Vec::new(),
    };
    save_custom_data(&data)
}

/// Reset to the three built-in default registries.
pub fn reset_to_defaults() -> io::Result<()> {
    let data = CustomData {
        registries: default_registries(),
        deleted_presets: Vec::new(),
    };
    save_custom_data(&data)
}

