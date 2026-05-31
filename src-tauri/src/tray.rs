use tauri::{
    menu::{CheckMenuItemBuilder, Menu, MenuBuilder, MenuItemBuilder},
    tray::TrayIconBuilder,
    Emitter, Manager, Wry,
};

use crate::{app_settings, commands, models, npmrc, registries};
use crate::registry_config::normalize_registry_url_key;

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

/// Get current registry name for tray menu checkmark
fn get_current_name(registries: &[models::Registry]) -> Option<String> {
    let url = npmrc::read_current_registry().ok()??;
    current_name_from_registry_url(&url, registries)
}

fn current_name_from_registry_url(url: &str, registries: &[models::Registry]) -> Option<String> {
    let current_key = normalize_registry_url_key(url);
    current_name_from_registry_url_key(&current_key, registries)
}

fn current_name_from_registry_url_key(current_key: &str, registries: &[models::Registry]) -> Option<String> {
    registries
        .iter()
        .find(|r| normalize_registry_url_key(&r.url) == current_key)
        .map(|r| r.name.clone())
}

/// 仅构建托盘右键菜单（不创建/销毁托盘图标，供 `set_menu` 使用）。
fn build_tray_context_menu(app: &tauri::AppHandle<Wry>) -> tauri::Result<Menu<Wry>> {
    let lang = app_settings::get_language();
    let all_regs = registries::get_all().unwrap_or_default();
    let current_name = get_current_name(&all_regs);

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

pub(crate) fn build_managed_tray(app: &tauri::AppHandle<Wry>) -> tauri::Result<()> {
    // Defensive cleanup: remove default or previous tray first.
    let _ = app.remove_tray_by_id("tray");
    let _ = app.remove_tray_by_id("main-tray");

    let menu = build_tray_context_menu(app)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| std::io::Error::other("缺少默认窗口图标"))?;

    let _tray = TrayIconBuilder::with_id("main-tray")
        .icon(icon)
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

pub(crate) fn refresh_tray_menu(app: &tauri::AppHandle<Wry>) -> Result<(), String> {
    let menu = build_tray_context_menu(app).map_err(|e| e.to_string())?;
    if let Some(tray) = app.tray_by_id("main-tray") {
        tray.set_menu(Some(menu)).map_err(|e| e.to_string())
    } else {
        build_managed_tray(app).map_err(|e| e.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::Registry;

    fn registry(name: &str, url: &str) -> Registry {
        Registry {
            name: name.to_string(),
            url: url.to_string(),
        }
    }

    #[test]
    fn current_name_from_registry_url_uses_loaded_registries() {
        let registries = vec![
            registry("npm", "https://registry.npmjs.org/"),
            registry("mirror", "https://mirror.example/npm/"),
        ];

        let current_name = current_name_from_registry_url(" https://mirror.example/npm ", &registries);

        assert_eq!(current_name.as_deref(), Some("mirror"));
    }
}
