mod app_settings;
mod commands;
mod instance_lock;
mod models;
mod npmrc;
mod paths;
mod project_registry;
mod proxy;
mod registry_config;
mod registries;
mod speedtest;
mod tray;

pub use instance_lock::{try_lock_single_instance, activate_existing_window, clear_single_instance_lock};
pub(crate) use tray::refresh_tray_menu;

use tauri_plugin_autostart::{MacosLauncher, ManagerExt};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            tray::build_managed_tray(app.handle())?;
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
            commands::import_registries,
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
            commands::restart_app,
        ])
        .build(tauri::generate_context!())
        .expect("error while building nrm-desktop")
        .run(|_app, event| {
            if matches!(event, tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. }) {
                instance_lock::cleanup_single_instance_lock();
            }
        });
}
