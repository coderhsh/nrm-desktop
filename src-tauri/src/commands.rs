use crate::models::Registry;
use crate::{app_settings, npmrc, project_registry, proxy, registries, speedtest};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use tauri::{Emitter, Manager};

/// 系统 PATH 中 `node` / `npm` / `pnpm` 的版本输出（与 `.npmrc` 实际使用的 CLI 一致）。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeNpmVersions {
    pub node: Option<String>,
    pub npm: Option<String>,
    pub pnpm: Option<String>,
}

fn trim_cli_version_output(bytes: &[u8]) -> Option<String> {
    let s = String::from_utf8_lossy(bytes);
    let s = s.trim();
    if s.is_empty() {
        None
    } else {
        Some(s.to_string())
    }
}

fn run_cli_version(bin: &str, version_flag: &str) -> Option<String> {
    let mut cmd = std::process::Command::new(bin);
    cmd.arg(version_flag);
    // Windows：GUI 父进程默认会为 `node`/`npm` 等控制台子进程分配可见控制台，导致启动时闪现黑框。
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    let output = match cmd.output() {
        Ok(output) => output,
        Err(_) => {
            #[cfg(target_os = "macos")]
            {
                return run_cli_version_via_login_shell(bin, version_flag);
            }
            #[cfg(not(target_os = "macos"))]
            {
                return None;
            }
        }
    };
    if !output.status.success() {
        #[cfg(target_os = "macos")]
        {
            return run_cli_version_via_login_shell(bin, version_flag);
        }
        #[cfg(not(target_os = "macos"))]
        {
            return None;
        }
    }
    trim_cli_version_output(&output.stdout).or_else(|| trim_cli_version_output(&output.stderr))
}

/// macOS 图形应用通常拿不到用户终端 PATH（如 nvm / Homebrew 注入），
/// 回退到登录交互 shell 读取版本，尽量与用户终端行为保持一致。
#[cfg(target_os = "macos")]
fn run_cli_version_via_login_shell(bin: &str, version_flag: &str) -> Option<String> {
    let shell = std::env::var("SHELL").ok().filter(|s| !s.trim().is_empty()).unwrap_or_else(|| "/bin/zsh".to_string());
    let command_line = format!("{bin} {version_flag}");
    let output = std::process::Command::new(shell)
        .args(["-lic", &command_line])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    trim_cli_version_output(&output.stdout).or_else(|| trim_cli_version_output(&output.stderr))
}

/// 读取当前 shell PATH 下的 Node、npm 与 pnpm 版本（不成功则为 `null`）。
#[tauri::command]
pub fn get_node_npm_versions() -> NodeNpmVersions {
    NodeNpmVersions {
        node: run_cli_version("node", "-v"),
        npm: run_cli_version("npm", "-v"),
        pnpm: run_cli_version("pnpm", "-v"),
    }
}

/// 与列表比较用的 registry URL 规范化。
fn registry_url_key(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// 仅写入 `.npmrc` 的 registry（备份 + 设置 URL）。不刷新托盘菜单。
/// 托盘 `on_menu_event` 内必须调用本函数而非带刷新的 `set_registry`，否则同步 `set_menu` 可能死锁。
pub(crate) fn set_registry_npmrc_only(name: &str) -> Result<(), String> {
    let all = registries::get_all().map_err(|e| e.to_string())?;
    let registry = all
        .iter()
        .find(|r| r.name == name)
        .ok_or_else(|| format!("未找到源: {}", name))?;

    npmrc::backup_npmrc().map_err(|e| format!("备份失败: {}", e))?;
    npmrc::set_registry(&registry.url).map_err(|e| format!("设置失败: {}", e))?;

    Ok(())
}

/// 切换到指定名称的源并刷新托盘、通知前端（供自动选源、删除后回切等复用）。
fn switch_to_registry_named(app: &tauri::AppHandle, name: &str) -> Result<(), String> {
    set_registry_npmrc_only(name)?;
    crate::refresh_tray_menu(app).map_err(|e| e.to_string())?;
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit("registry-changed", name);
    }
    Ok(())
}

/// 若用户未配置 `registry`（无或为空），启动时自动测速并切换到延迟最低的源。
pub async fn apply_fastest_registry_if_npmrc_empty(app: tauri::AppHandle) {
    let unset = match npmrc::read_current_registry() {
        Ok(None) => true,
        Ok(Some(s)) if s.trim().is_empty() => true,
        _ => false,
    };
    if !unset {
        return;
    }

    if registries::get_all().map(|v| v.is_empty()).unwrap_or(true) {
        return;
    }

    let best_name = match speedtest::fastest_registry_name_with_fallback().await {
        Ok(n) => n,
        Err(e) => {
            eprintln!("[nrm-desktop] 自动测速选择默认源失败: {e}");
            return;
        }
    };

    if let Err(e) = switch_to_registry_named(&app, &best_name) {
        eprintln!("[nrm-desktop] 自动设置默认源失败: {e}");
    }
}

#[tauri::command]
pub fn get_registries() -> Result<Vec<Registry>, String> {
    registries::get_all().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_current_registry() -> Result<Option<Registry>, String> {
    let url = npmrc::read_current_registry().map_err(|e| e.to_string())?;

    match url {
        Some(current_url) => {
            let key = current_url.trim().trim_end_matches('/').to_string();
            let all = registries::get_all().map_err(|e| e.to_string())?;
            let found = all.into_iter().find(|r| {
                registry_url_key(&r.url) == key
            });
            Ok(found.or_else(|| {
                Some(Registry {
                    name: app_settings::i18n_merged_current_registry_name(),
                    url: current_url,
                })
            }))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn set_registry(app: tauri::AppHandle, name: &str) -> Result<(), String> {
    set_registry_npmrc_only(name)?;
    crate::refresh_tray_menu(&app).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn add_registry(app: tauri::AppHandle, name: &str, url: &str) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".to_string());
    }
    registries::add(name, url).map_err(|e| e.to_string())?;
    crate::refresh_tray_menu(&app).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn delete_registry(app: tauri::AppHandle, name: String) -> Result<(), String> {
    let current_url = npmrc::read_current_registry().map_err(|e| e.to_string())?;
    let all_before = registries::get_all().map_err(|e| e.to_string())?;
    let target = all_before.iter().find(|r| r.name == name);
    let was_current = match (&current_url, target) {
        (Some(cu), Some(reg)) => registry_url_key(cu) == registry_url_key(&reg.url),
        _ => false,
    };

    registries::delete(&name).map_err(|e| e.to_string())?;

    if was_current {
        let all_after = registries::get_all().map_err(|e| e.to_string())?;
        if all_after.is_empty() {
            eprintln!("[nrm-desktop] 已删除最后一个源，registry 仍指向已删除的地址");
            return Ok(());
        }
        let best_name = speedtest::fastest_registry_name_with_fallback().await?;
        switch_to_registry_named(&app, &best_name)?;
    }

    Ok(())
}

#[tauri::command]
pub async fn delete_registries_bulk(app: tauri::AppHandle, names: Vec<String>) -> Result<(), String> {
    if names.is_empty() {
        return Ok(());
    }

    let unique_names: Vec<String> = {
        let mut seen = HashSet::new();
        let mut out = Vec::new();
        for name in names {
            if seen.insert(name.clone()) {
                out.push(name);
            }
        }
        out
    };

    let current_url = npmrc::read_current_registry().map_err(|e| e.to_string())?;
    let all_before = registries::get_all().map_err(|e| e.to_string())?;
    let mut deleted_current = false;

    for name in &unique_names {
        if let (Some(cu), Some(reg)) = (&current_url, all_before.iter().find(|r| &r.name == name)) {
            if registry_url_key(cu) == registry_url_key(&reg.url) {
                deleted_current = true;
            }
        }
    }

    registries::delete_many(&unique_names).map_err(|e| e.to_string())?;

    if deleted_current {
        let all_after = registries::get_all().map_err(|e| e.to_string())?;
        if all_after.is_empty() {
            eprintln!("[nrm-desktop] 批量删除后已无可用源，registry 可能仍指向已删除地址");
        } else {
            let best_name = speedtest::fastest_registry_name_with_fallback().await?;
            switch_to_registry_named(&app, &best_name)?;
        }
    } else {
        crate::refresh_tray_menu(&app).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
pub fn update_registry(
    app: tauri::AppHandle,
    name: &str,
    new_name: &str,
    new_url: &str,
) -> Result<(), String> {
    if !new_url.starts_with("http://") && !new_url.starts_with("https://") {
        return Err("URL 必须以 http:// 或 https:// 开头".to_string());
    }
    registries::update(name, new_name, new_url).map_err(|e| e.to_string())?;
    crate::refresh_tray_menu(&app).map_err(|e| e.to_string())?;
    Ok(())
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
pub async fn test_url_speed(url: &str) -> Result<speedtest::LatencyResult, String> {
    speedtest::test_url(url).await
}

#[derive(Debug, Deserialize)]
pub struct RegistryImportItem {
    pub name: String,
    pub url: String,
}

#[tauri::command]
pub fn import_registries(items: Vec<RegistryImportItem>) -> Result<(), String> {
    let imported: Vec<Registry> = items
        .into_iter()
        .map(|item| Registry {
            name: item.name.trim().to_string(),
            url: item.url.trim().to_string(),
        })
        .filter(|r| !r.name.is_empty() && !r.url.is_empty())
        .collect();
    registries::import_custom(&imported).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reset_defaults(app: tauri::AppHandle) -> Result<String, String> {
    registries::reset_to_defaults().map_err(|e| e.to_string())?;
    let lang = app_settings::reset_language_to_os_default().map_err(|e| e.to_string())?;
    registries::merge_current_npm_registry_if_missing().map_err(|e| e.to_string())?;
    crate::refresh_tray_menu(&app).map_err(|e| e.to_string())?;
    Ok(lang)
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

#[tauri::command]
pub fn exit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
pub fn hide_main_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| format!("隐藏主窗口失败: {}", e))?;
        return Ok(());
    }
    Err("未找到主窗口".to_string())
}

#[tauri::command]
pub fn get_app_language() -> Result<String, String> {
    Ok(app_settings::get_language())
}

#[tauri::command]
pub fn set_app_language(app: tauri::AppHandle, lang: &str) -> Result<(), String> {
    if lang != "zh-CN" && lang != "en" {
        return Err("不支持的语言".to_string());
    }
    app_settings::set_language(lang).map_err(|e| format!("保存语言设置失败: {}", e))?;
    crate::refresh_tray_menu(&app)?;
    Ok(())
}

/// 当前环境是否允许在应用内开关「登录时启动」：仅 **正式构建** 的 Windows / macOS / Linux 桌面端。  
/// 开发构建（`pnpm dev`）会访问 `devUrl` localhost，若注册自启动会在开机后因无开发服务器而白屏/拒连。
#[tauri::command]
pub fn is_autostart_platform_supported() -> bool {
    let desktop = cfg!(any(
        target_os = "windows",
        target_os = "macos",
        target_os = "linux"
    ));
    let release_build = cfg!(not(debug_assertions));
    desktop && release_build
}
