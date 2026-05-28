use crate::app_settings;
use crate::models::{default_registries, Registry};
use crate::npmrc;
use crate::paths;
use crate::registry_config::normalize_registry_url_key;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
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

/// Get the path to the custom registries file.
fn custom_file_path() -> PathBuf {
    paths::config_dir().join("custom.json")
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

    let normalized = normalize_registry_entries(data.registries);
    data.registries = normalized;

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

/// Save full custom data to the JSON file.
fn save_custom_data(data: &CustomData) -> io::Result<()> {
    paths::ensure_config_dir()?;
    let content = serde_json::to_string_pretty(&data)?;
    fs::write(custom_file_path(), content)?;
    Ok(())
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
    let mut data = load_custom_data()?;

    if data.registries.iter().any(|r| r.name == name) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该名称已存在"));
    }

    if data.registries.iter().any(|r| r.url == url) {
        return Err(io::Error::new(io::ErrorKind::AlreadyExists, "该 URL 已存在"));
    }

    data.registries.push(Registry {
        name: name.to_string(),
        url: url.to_string(),
    });

    save_custom_data(&data)
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

/// Delete multiple registries with a single read/write cycle.
pub fn delete_many(names: &[String]) -> io::Result<()> {
    if names.is_empty() {
        return Ok(());
    }

    let mut data = load_custom_data()?;
    let requested_names: HashSet<&str> = names.iter().map(String::as_str).collect();

    if requested_names
        .iter()
        .any(|name| !data.registries.iter().any(|r| r.name == *name))
    {
        return Err(io::Error::new(io::ErrorKind::NotFound, "未找到该源"));
    }

    data.registries
        .retain(|r| !requested_names.contains(r.name.as_str()));
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::panic::{catch_unwind, resume_unwind, AssertUnwindSafe};
    use std::sync::Mutex;
    use std::time::{SystemTime, UNIX_EPOCH};

    static ENV_LOCK: Mutex<()> = Mutex::new(());

    fn registry(name: &str, url: &str) -> Registry {
        Registry {
            name: name.to_string(),
            url: url.to_string(),
        }
    }

    fn with_temp_home<T>(test: impl FnOnce() -> T) -> T {
        let _guard = ENV_LOCK.lock().expect("env test lock poisoned");
        let old_home = std::env::var_os("HOME");
        let old_userprofile = std::env::var_os("USERPROFILE");
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock before unix epoch")
            .as_nanos();
        let temp_home = std::env::temp_dir().join(format!(
            "nrm-desktop-registries-test-{}-{unique}",
            std::process::id()
        ));

        fs::create_dir_all(&temp_home).expect("create temp home");
        std::env::set_var("HOME", &temp_home);
        std::env::remove_var("USERPROFILE");

        let result = catch_unwind(AssertUnwindSafe(test));

        restore_env_var("HOME", old_home);
        restore_env_var("USERPROFILE", old_userprofile);
        fs::remove_dir_all(&temp_home).expect("remove temp home");

        match result {
            Ok(value) => value,
            Err(panic) => resume_unwind(panic),
        }
    }

    fn restore_env_var(key: &str, value: Option<OsString>) {
        if let Some(value) = value {
            std::env::set_var(key, value);
        } else {
            std::env::remove_var(key);
        }
    }

    #[test]
    fn delete_many_removes_all_requested_registries() {
        with_temp_home(|| {
            import_custom(&[
                registry("one", "https://one.example/"),
                registry("two", "https://two.example/"),
                registry("three", "https://three.example/"),
            ])
            .expect("seed registries");

            delete_many(&["one".to_string(), "three".to_string()]).expect("delete registries");

            let remaining: Vec<(String, String)> = get_all()
                .expect("load registries")
                .into_iter()
                .map(|r| (r.name, r.url))
                .collect();

            assert_eq!(
                remaining,
                vec![("two".to_string(), "https://two.example/".to_string())]
            );
        });
    }
}
