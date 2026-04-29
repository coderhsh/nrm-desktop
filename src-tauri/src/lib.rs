mod commands;
mod models;
mod npmrc;
mod project_registry;
mod proxy;
mod registries;
mod speedtest;

use std::path::PathBuf;
use tauri::{
    menu::{MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager,
};

/// Get current registry name for tray menu checkmark
fn get_current_name() -> Option<String> {
    let url = npmrc::read_current_registry().ok()?;
    let current_url = url?;
    let all = registries::get_all().ok()?;
    all.into_iter()
        .find(|r| r.url == current_url)
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
        .setup(|app| {
            // Defensive cleanup: if a default tray was auto-created by config,
            // remove it before creating the managed tray to prevent duplicates.
            let _ = app.remove_tray_by_id("tray");

            if app.tray_by_id("main-tray").is_some() {
                return Ok(());
            }

            let all_regs = registries::get_all().unwrap_or_default();
            let current_name = get_current_name();

            // Build menu items with checkmarks
            let mut menu_builder = MenuBuilder::new(app);

            for reg in &all_regs {
                let is_current = current_name.as_deref() == Some(&reg.name);
                let text = if is_current {
                    format!("✓ {}", reg.name)
                } else {
                    reg.name.clone()
                };
                let item = MenuItemBuilder::with_id(reg.name.clone(), text).build(app)?;
                menu_builder = menu_builder.item(&item);
            }

            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出应用").build(app)?;

            menu_builder = menu_builder.separator().item(&show_item);
            menu_builder = menu_builder.separator().item(&quit_item);

            let menu = menu_builder.build()?;

            let _tray = TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| {
                    let id = event.id().0.as_str();
                    match id {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {
                            let _ = commands::set_registry(id);
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.emit("registry-changed", id);
                            }
                        }
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
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_registries,
            commands::get_current_registry,
            commands::set_registry,
            commands::add_registry,
            commands::delete_registry,
            commands::update_registry,
            commands::test_all_speed,
            commands::test_single_speed,
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
        ])
        .build(tauri::generate_context!())
        .expect("error while building nrm-desktop")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                cleanup_single_instance_lock();
            }
        });
}
