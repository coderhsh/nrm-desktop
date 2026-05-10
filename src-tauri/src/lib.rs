mod app_settings;
mod commands;
mod models;
mod npmrc;
mod project_registry;
mod proxy;
mod registries;
mod speedtest;

use std::path::PathBuf;
use tauri::{
    menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, Wry,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

fn i18n(lang: &str, zh: &str, en: &str) -> String {
    if lang == "en" {
        en.to_string()
    } else {
        zh.to_string()
    }
}

/// Windows 菜单将 `&` 视为助记符，需写成 `&&` 才能显示原字符。
fn escape_menu_mnemonic(label: &str) -> String {
    label.replace('&', "&&")
}

/// 与 `show` / `quit` reserved 错开，事件里解析时去掉此前缀。
const REGISTRY_MENU_ID_PREFIX: &str = "reg:";

/// 仅构建托盘右键菜单（不创建/销毁托盘图标，供 `set_menu` 使用）。
fn build_tray_context_menu(app: &tauri::AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let lang = app_settings::get_language();
    let all_regs = registries::get_all().unwrap_or_default();
    let current_name = get_current_name();

    let mut menu_builder = MenuBuilder::new(app);

    for reg in &all_regs {
        let is_current = current_name.as_deref() == Some(&reg.name);
        let label = escape_menu_mnemonic(&reg.name);
        let menu_id = format!("{REGISTRY_MENU_ID_PREFIX}{}", reg.name);
        let item = CheckMenuItemBuilder::with_id(menu_id, label)
            .checked(is_current)
            .build(app)?;
        menu_builder = menu_builder.item(&item);
    }

    let show_item = MenuItemBuilder::with_id("show", i18n(&lang, "显示主窗口", "Show Main Window")).build(app)?;
    let quit_item = MenuItemBuilder::with_id("quit", i18n(&lang, "退出应用", "Quit App")).build(app)?;

    menu_builder = menu_builder.separator().item(&show_item);
    menu_builder = menu_builder.separator().item(&quit_item);

    menu_builder.build()
}

fn build_managed_tray(app: &tauri::AppHandle<Wry>) -> tauri::Result<()> {
    // Defensive cleanup: remove default or previous tray first.
    let _ = app.remove_tray_by_id("tray");
    let _ = app.remove_tray_by_id("main-tray");

    let menu = build_tray_context_menu(app)?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        // 左键仅由 `on_tray_icon_event` 唤起主窗口；右键仍弹出上下文菜单（切换源、退出等）。
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref();
            match id {
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.emit("window-restored-from-tray", ());
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "quit" => {
                    app.exit(0);
                }
                _ if id.starts_with(REGISTRY_MENU_ID_PREFIX) => {
                    let name = &id[REGISTRY_MENU_ID_PREFIX.len()..];
                    match commands::set_registry_npmrc_only(name) {
                        Ok(()) => {
                            // 勿在 on_menu_event 内同步 refresh_tray；勿在同一线程直接 run_on_main_thread（会立刻执行并死锁）。先 spawn 再起线程安全地 schedule。
                            let ah = app.clone();
                            let name_owned = name.to_string();
                            std::thread::spawn(move || {
                                let ah_main = ah.clone();
                                if let Err(e) = ah.run_on_main_thread(move || {
                                    if let Err(e) = refresh_tray_menu(&ah_main) {
                                        eprintln!("[tray] 刷新菜单失败: {e}");
                                    }
                                    if let Some(window) = ah_main.get_webview_window("main") {
                                        let _ = window.emit("registry-changed", name_owned.as_str());
                                    }
                                }) {
                                    eprintln!("[tray] 无法调度托盘刷新: {e}");
                                }
                            });
                        }
                        Err(e) => eprintln!("[tray] 切换源失败: {e}"),
                    }
                }
                _ => {}
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.emit("window-restored-from-tray", ());
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    Ok(())
}

pub fn refresh_tray_menu(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
    let menu = build_tray_context_menu(app).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())
    } else {
        build_managed_tray(app).map_err(|e| e.to_string())
    }
}

/// 与列表里的 URL 比较时忽略首尾空白与末尾 `/`。
fn registry_url_key(url: &str) -> String {
    url.trim().trim_end_matches('/').to_string()
}

/// Get current registry name for tray menu checkmark
fn get_current_name() -> Option<String> {
    let url = npmrc::read_current_registry().ok()??;
    let current_key = registry_url_key(&url);
    let all = registries::get_all().ok()?;
    all.into_iter()
        .find(|r| registry_url_key(&r.url) == current_key)
        .map(|r| r.name)
}

/// Try to acquire single instance lock.
/// Returns true if this is the first instance.
pub fn try_lock_single_instance() -> bool {
    let lock = lock_file_path();
    // Ensure config dir exists
    if let Some(parent) = lock.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    match std::fs::File::create_new(&lock) {
        Ok(_) => {
            let _ = std::fs::write(&lock, std::process::id().to_string());
            true
        }
        Err(_) => false,
    }
}

/// Activate existing window by finding and bringing it to front.
/// Returns `true` if a window was found and activated.
pub fn activate_existing_window() -> bool {
    #[cfg(windows)]
    {
        extern "system" {
            fn FindWindowW(
                lpClassName: *const u16,
                lpWindowName: *const u16,
            ) -> isize;
            fn SetForegroundWindow(hWnd: isize) -> i32;
            fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
        }

        use std::ffi::OsStr;
        use std::os::windows::ffi::OsStrExt;

        let title: Vec<u16> = OsStr::new("nrm-desktop")
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();
        const SW_RESTORE: i32 = 9;

        unsafe {
            let hwnd = FindWindowW(std::ptr::null(), title.as_ptr());
            if hwnd != 0 {
                SetForegroundWindow(hwnd);
                ShowWindow(hwnd, SW_RESTORE);
                return true;
            }
        }
    }
    false
}

fn lock_file_path() -> PathBuf {
    let home =
        std::env::var("USERPROFILE").unwrap_or_else(|_| std::env::var("HOME").unwrap_or_else(|_| ".".to_string()));
    PathBuf::from(home).join(".nrm-desktop").join(".instance.lock")
}

/// Remove single instance lock file when app exits.
fn cleanup_single_instance_lock() {
    let lock = lock_file_path();
    if lock.exists() {
        let _ = std::fs::remove_file(lock);
    }
}

/// Clear single instance lock file manually.
pub fn clear_single_instance_lock() {
    cleanup_single_instance_lock();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            // 开发构建下自启动会注册 target/debug 可执行文件，开机后将请求 devUrl localhost；清除误注册。
            #[cfg(debug_assertions)]
            if let Err(e) = app.autolaunch().disable() {
                eprintln!("[nrm-desktop] 开发构建：尝试清除自启动项失败: {e}");
            }
            if let Err(e) = registries::merge_current_npm_registry_if_missing() {
                eprintln!("[nrm-desktop] 合并当前 npm 源到列表失败: {e}");
            }
            build_managed_tray(app.handle())?;
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::apply_fastest_registry_if_npmrc_empty(handle).await;
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_registries,
            commands::get_current_registry,
            commands::set_registry,
            commands::add_registry,
            commands::delete_registry,
            commands::delete_registries_bulk,
            commands::update_registry,
            commands::test_all_speed,
            commands::test_single_speed,
            commands::test_url_speed,
            commands::export_config,
            commands::import_config,
            commands::reset_defaults,
            commands::write_text_file,
            commands::read_text_file,
            commands::get_project_registry,
            commands::get_proxy_config,
            commands::detect_env_proxy,
            commands::set_proxy_config,
            commands::exit_app,
            commands::hide_main_window,
            commands::get_app_language,
            commands::set_app_language,
            commands::get_node_npm_versions,
            commands::is_autostart_platform_supported,
        ])
        .build(tauri::generate_context!())
        .expect("error while building nrm-desktop")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                cleanup_single_instance_lock();
            }
        });
}
