use crate::models::{preset_registries, Registry};
use crate::npmrc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

/// 自动导入的「当前 npm 源」在列表中的默认显示名称（与预设源名称不冲突）。
const IMPORTED_CURRENT_REGISTRY_NAME: &str = "当前源";

#[derive(Debug, Serialize, Deserialize)]
struct CustomData {
    #[serde(default)]
    registries: Vec<Registry>,
    #[serde(default)]
    deleted_presets: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportData {
    pub version: String,
    pub exported_at: String,
    pub presets: Vec<Registry>,
    pub custom: Vec<Registry>,
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

/// Load custom registries from the JSON file.
fn load_custom_data() -> io::Result<CustomData> {
    let path = custom_file_path();
    if !path.exists() {
        return Ok(CustomData {
            registries: Vec::new(),
            deleted_presets: Vec::new(),
        });
    }
    let content = fs::read_to_string(&path)?;
    let data: CustomData = serde_json::from_str(&content)?;
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

/// 为即将导入的未知当前源生成不与现有列表冲突的名称。
fn pick_name_for_imported_current(all: &[Registry], url: &str) -> String {
    if !all.iter().any(|r| r.name == IMPORTED_CURRENT_REGISTRY_NAME) {
        return IMPORTED_CURRENT_REGISTRY_NAME.to_string();
    }
    let base = host_hint_from_registry_url(url)
        .map(|h| format!("自定义·{}", h))
        .unwrap_or_else(|| "npmrc 源".to_string());
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

/// 将「当前 npmrc 中的源」写入自定义列表（供启动时合并）；允许与**已删除**的预设同源 URL，避免 `add` 的预设 URL 校验误伤。
fn insert_merged_current_registry(name: &str, url: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let presets = preset_registries();
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
    let represented_by_visible_preset = presets.iter().any(|p| {
        normalize_registry_url_key(&p.url) == key
            && !data.deleted_presets.iter().any(|d| d == &p.name)
    });
    if represented_by_visible_preset {
        return Ok(());
    }

    data.registries.push(Registry {
        name: name.to_string(),
        url: url.to_string(),
        is_custom: true,
    });
    save_custom_data(&data)
}

/// 启动时：若用户 `.npmrc` 中的 registry 不在当前列表中，则写入自定义配置以便界面与托盘可操作。
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

/// Get all registries: presets + custom.
pub fn get_all() -> io::Result<Vec<Registry>> {
    let data = load_custom_data()?;
    let presets = preset_registries();
    let mut all = Vec::new();

    for preset in &presets {
        if data.deleted_presets.iter().any(|name| name == &preset.name) {
            continue;
        }
        if let Some(custom_override) = data.registries.iter().find(|r| r.name == preset.name) {
            all.push(custom_override.clone());
        } else {
            all.push(preset.clone());
        }
    }

    for custom in &data.registries {
        if !presets.iter().any(|preset| preset.name == custom.name) {
            all.push(custom.clone());
        }
    }

    Ok(all)
}

/// Add a custom registry.
pub fn add(name: &str, url: &str) -> io::Result<()> {
    let mut custom = load_custom()?;

    // Check for duplicate name
    if custom.iter().any(|r| r.name == name) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
    }

    // Check for duplicate URL
    if custom.iter().any(|r| r.url == url) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该 URL 已存在"));
    }

    // Also check against presets
    if preset_registries().iter().any(|r| r.name == name || r.url == url) {
        return Err(io::Error::new(
            io::ErrorKind::AlreadyExists,
            "与预设源名称或 URL 冲突",
        ));
    }

    custom.push(Registry {
        name: name.to_string(),
        url: url.to_string(),
        is_custom: true,
    });

    save_custom(&custom)
}

/// Delete a custom registry.
pub fn delete(name: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let is_preset = preset_registries().iter().any(|r| r.name == name);
    let custom_len_before = data.registries.len();
    data.registries.retain(|r| r.name != name);

    if is_preset {
        if !data.deleted_presets.iter().any(|preset_name| preset_name == name) {
            data.deleted_presets.push(name.to_string());
        }
        return save_custom_data(&data);
    }

    if data.registries.len() == custom_len_before {
        return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该源"));
    }

    save_custom_data(&data)
}

/// Update a custom registry.
pub fn update(name: &str, new_name: &str, new_url: &str) -> io::Result<()> {
    let mut data = load_custom_data()?;
    let presets = preset_registries();
    let idx = data.registries.iter().position(|r| r.name == name);

    // If target is a preset source, allow overriding URL and renaming.
    if idx.is_none() {
        let is_preset = presets.iter().any(|r| r.name == name);
        if !is_preset {
            return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该源"));
        }

        // Prevent conflicts with existing custom entries.
        if data.registries.iter().any(|r| r.name == new_name) {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
        }

        // Prevent conflicts with visible preset entries.
        if presets.iter().any(|preset| {
            preset.name == new_name
                && preset.name != name
                && !data
                    .deleted_presets
                    .iter()
                    .any(|deleted_name| deleted_name == &preset.name)
        }) {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
        }

        data.registries.push(Registry {
            name: new_name.to_string(),
            url: new_url.to_string(),
            is_custom: true,
        });

        if new_name == name {
            data.deleted_presets.retain(|preset_name| preset_name != name);
        } else if !data.deleted_presets.iter().any(|preset_name| preset_name == name) {
            data.deleted_presets.push(name.to_string());
        }

        return save_custom_data(&data);
    }

    let idx = idx.expect("index already checked");

    // Check for name conflict with other entries
    if name != new_name {
        if data
            .registries
            .iter()
            .any(|r| r.name == new_name && r.name != name)
        {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
        }
        if presets.iter().any(|preset| {
            preset.name == new_name
                && !data
                    .deleted_presets
                    .iter()
                    .any(|deleted_name| deleted_name == &preset.name)
        }) {
            return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
        }
    }

    data.registries[idx].name = new_name.to_string();
    data.registries[idx].url = new_url.to_string();

    save_custom_data(&data)
}

/// Export all registries (preset + custom) as ExportData.
pub fn export_all() -> io::Result<ExportData> {
    let custom = load_custom()?;
    let now = chrono_now();
    Ok(ExportData {
        version: "1.0".to_string(),
        exported_at: now,
        presets: preset_registries(),
        custom,
    })
}

/// Import and replace custom registries.
pub fn import_custom(imported: &[Registry]) -> io::Result<()> {
    for reg in imported {
        if preset_registries().iter().any(|p| p.name == reg.name) {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("源名称 '{}' 与预设源冲突", reg.name),
            ));
        }
        if preset_registries().iter().any(|p| p.url == reg.url) {
            return Err(io::Error::new(
                io::ErrorKind::AlreadyExists,
                format!("URL '{}' 与预设源冲突", reg.url),
            ));
        }
    }
    let mut cleaned: Vec<Registry> = imported
        .iter()
        .map(|r| Registry {
            name: r.name.trim().to_string(),
            url: r.url.trim().to_string(),
            is_custom: true,
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

/// Remove all custom registries.
pub fn reset_to_defaults() -> io::Result<()> {
    let data = CustomData {
        registries: Vec::new(),
        deleted_presets: Vec::new(),
    };
    save_custom_data(&data)
}

fn chrono_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let dur = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
    let secs = dur.as_secs();
    let days = secs / 86400;
    let t = secs % 86400;
    let h = t / 3600;
    let m = (t % 3600) / 60;
    let s = t % 60;

    let mut y = 1970i64;
    let mut rem = days as i64;
    loop {
        let diy = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) { 366 } else { 365 };
        if rem < diy { break; }
        rem -= diy;
        y += 1;
    }
    let mdays: [i64; 12] = if (y % 4 == 0 && y % 100 != 0) || (y % 400 == 0) {
        [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    } else {
        [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
    };
    let mut mo = 1;
    for &md in &mdays {
        if rem < md { break; }
        rem -= md;
        mo += 1;
    }
    format!("{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z", y, mo, rem + 1, h, m, s)
}
