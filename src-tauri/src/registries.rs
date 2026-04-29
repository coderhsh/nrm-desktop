use crate::models::{preset_registries, Registry};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize)]
struct CustomData {
    registries: Vec<Registry>,
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
fn load_custom() -> io::Result<Vec<Registry>> {
    let path = custom_file_path();
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&path)?;
    let data: CustomData = serde_json::from_str(&content)?;
    Ok(data.registries)
}

/// Save custom registries to the JSON file.
fn save_custom(registries: &[Registry]) -> io::Result<()> {
    ensure_config_dir()?;
    let data = CustomData {
        registries: registries.to_vec(),
    };
    let content = serde_json::to_string_pretty(&data)?;
    fs::write(custom_file_path(), content)?;
    Ok(())
}

/// Get all registries: presets + custom.
pub fn get_all() -> io::Result<Vec<Registry>> {
    let custom = load_custom()?;
    let mut all = preset_registries();
    all.extend(custom);
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
    let mut custom = load_custom()?;
    let len_before = custom.len();
    custom.retain(|r| r.name != name);

    if custom.len() == len_before {
        return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该自定义源"));
    }

    save_custom(&custom)
}

/// Update a custom registry.
pub fn update(name: &str, new_name: &str, new_url: &str) -> io::Result<()> {
    let mut custom = load_custom()?;
    let idx = custom.iter().position(|r| r.name == name);

    // If target is a preset source, allow overriding URL with same name.
    if idx.is_none() {
        let is_preset = preset_registries().iter().any(|r| r.name == name);
        if !is_preset {
            return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该源"));
        }
        if new_name != name {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "预设源不支持修改名称",
            ));
        }

        custom.push(Registry {
            name: new_name.to_string(),
            url: new_url.to_string(),
            is_custom: true,
        });
        return save_custom(&custom);
    }

    let idx = idx.expect("index already checked");

    // Check for name conflict with other entries
    if name != new_name
        && custom
            .iter()
            .any(|r| r.name == new_name && r.name != name)
    {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
    }

    custom[idx].name = new_name.to_string();
    custom[idx].url = new_url.to_string();

    save_custom(&custom)
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
    save_custom(&cleaned)
}

/// Remove all custom registries.
pub fn reset_to_defaults() -> io::Result<()> {
    save_custom(&[])
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
