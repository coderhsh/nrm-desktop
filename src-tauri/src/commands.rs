use crate::models::Registry;
use crate::{npmrc, project_registry, proxy, registries, speedtest};

#[tauri::command]
pub fn get_registries() -> Result<Vec<Registry>, String> {
    registries::get_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_registry() -> Result<Option<Registry>, String> {
    let url = npmrc::read_current_registry().map_err(|e| e.to_string())?;

    match url {
        Some(current_url) => {
            let all = registries::get_all().map_err(|e| e.to_string())?;
            let found = all.into_iter().find(|r| r.url == current_url);
            Ok(found.or_else(|| {
                Some(Registry {
                    name: "自定义".to_string(),
                    url: current_url,
                    is_custom: true,
                })
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn set_registry(name: &str) -> Result<(), String> {
    let all = registries::get_all().map_err(|e| e.to_string())?;
    let registry = all
        .iter()
        .find(|r| r.name == name)
        .ok_or_else(|| format!("未找到源: {}", name))?;

    npmrc::backup_npmrc().map_err(|e| format!("备份失败: {}", e))?;
    npmrc::set_registry(&registry.url).map_err(|e| format!("设置失败: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn add_registry(name: &str, url: &str) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".to_string());
    }
    registries::add(name, url).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_registry(name: &str) -> Result<(), String> {
    registries::delete(name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_registry(name: &str, new_name: &str, new_url: &str) -> Result<(), String> {
    if !new_url.starts_with("http://") && !new_url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".to_string());
    }
    registries::update(name, new_name, new_url).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_all_speed() -> Result<Vec<speedtest::LatencyResult>, String> {
    speedtest::test_all().await
}

#[tauri::command]
pub async fn test_single_speed(name: &str) -> Result<speedtest::LatencyResult, String> {
    speedtest::test_single(name).await
}

#[tauri::command]
pub fn export_config() -> Result<registries::ExportData, String> {
    registries::export_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_config(json_data: &str) -> Result<(), String> {
    let data: registries::ExportData =
        serde_json::from_str(json_data).map_err(|e| format!("JSON 解析失败: {}", e))?;
    registries::import_custom(&data.custom).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_defaults() -> Result<(), String> {
    registries::reset_to_defaults().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn write_text_file(path: &str, content: &str) -> Result<(), String> {
    std::fs::write(path, content).map_err(|e| format!("写入文件失败: {}", e))
}

#[tauri::command]
pub fn read_text_file(path: &str) -> Result<String, String> {
    std::fs::read_to_string(path).map_err(|e| format!("读取文件失败: {}", e))
}

#[tauri::command]
pub fn get_project_registry() -> Result<Option<(String, String)>, String> {
    match project_registry::find_project_nrmrc() {
        Some((path, url)) => Ok(Some((path.to_string_lossy().to_string(), url))),
        None => Ok(None),
    }
}

#[tauri::command]
pub fn get_proxy_config() -> Result<proxy::ProxyConfig, String> {
    Ok(proxy::read_npmrc_proxy())
}

#[tauri::command]
pub fn detect_env_proxy() -> Result<proxy::ProxyConfig, String> {
    Ok(proxy::detect_env_proxy())
}

#[tauri::command]
pub fn set_proxy_config(config: proxy::ProxyConfig) -> Result<(), String> {
    proxy::set_npmrc_proxy(&config)
}
