use std::error::Error;
use std::io;
use std::sync::atomic::{AtomicBool, Ordering};

use tauri::menu::{CheckMenuItem, Menu, MenuItem, Submenu};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{App, AppHandle, Manager, WindowEvent, Wry};
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_dialog::{DialogExt, MessageDialogKind};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

pub(crate) const AUTOSTART_ARG: &str = "--autostart";
pub(crate) const TRAY_ID: &str = "erp-tray";
const OPEN_MENU: &str = "erp-open-main";
const QUIT_MENU: &str = "erp-quit";
const OPEN_TRAY_MENU: &str = "erp-tray-open-main";
const QUIT_TRAY_MENU: &str = "erp-tray-quit";
const AUTOSTART_MENU: &str = "erp-toggle-autostart";

// A second launch may arrive before the main window has been created.
static SHOW_REQUESTED: AtomicBool = AtomicBool::new(false);

struct DesktopMenu {
    autostart: CheckMenuItem<Wry>,
    shortcut_warning_pending: AtomicBool,
}

pub(crate) fn append_app_menu(app: &AppHandle, menu: &Menu<Wry>) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, OPEN_MENU, "打开 ERP", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, QUIT_MENU, "退出 ERP", true, None::<&str>)?;
    let autostart = CheckMenuItem::with_id(
        app,
        AUTOSTART_MENU,
        "开机自启动",
        true,
        false,
        None::<&str>,
    )?;
    menu.append(&Submenu::with_items(app, "桌面", true, &[&open, &autostart, &quit])?)?;
    app.manage(DesktopMenu {
        autostart,
        shortcut_warning_pending: AtomicBool::new(false),
    });
    Ok(())
}

pub(crate) fn setup(app: &mut App, start_hidden: bool) -> Result<(), Box<dyn Error>> {
    let handle = app.handle();
    let open = MenuItem::with_id(handle, OPEN_TRAY_MENU, "打开 ERP", true, None::<&str>)?;
    let quit = MenuItem::with_id(handle, QUIT_TRAY_MENU, "退出 ERP", true, None::<&str>)?;
    let menu = Menu::with_items(handle, &[&open, &quit])?;
    let icon = handle
        .default_window_icon()
        .ok_or_else(|| io::Error::other("Missing ERP app icon"))?;
    let name = handle.config().product_name.as_deref().unwrap_or("ZH ERP");
    TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon.clone())
        .tooltip(name)
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        })
        .build(handle)?;

    let window = handle
        .get_webview_window(crate::MAIN_WINDOW)
        .ok_or_else(|| io::Error::other("Missing ERP main window"))?;
    let main_window = window.clone();
    window.on_window_event(move |event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            if main_window.hide().is_ok() {
                api.prevent_close();
            }
        }
    });

    let desktop_menu = handle.state::<DesktopMenu>();
    if let Ok(enabled) = handle.autolaunch().is_enabled() {
        let _ = desktop_menu.autostart.set_checked(enabled);
    }

    if let Err(error) = register_shortcut(handle) {
        eprintln!("Failed to register ERP global shortcut: {error}");
        if start_hidden {
            desktop_menu.shortcut_warning_pending.store(true, Ordering::Relaxed);
        } else {
            show_shortcut_warning(handle);
        }
    }

    if SHOW_REQUESTED.swap(false, Ordering::Relaxed) {
        show_main(handle);
    }
    Ok(())
}

pub(crate) fn show_main(app: &AppHandle) {
    SHOW_REQUESTED.store(true, Ordering::Relaxed);
    let Some(window) = app.get_webview_window(crate::MAIN_WINDOW) else {
        return;
    };
    SHOW_REQUESTED.store(false, Ordering::Relaxed);
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();

    if let Some(menu) = app.try_state::<DesktopMenu>() {
        if menu.shortcut_warning_pending.swap(false, Ordering::Relaxed) {
            show_shortcut_warning(app);
        }
    }
}

pub(crate) fn handle_menu(app: &AppHandle, id: &str) {
    match id {
        OPEN_MENU | OPEN_TRAY_MENU => show_main(app),
        QUIT_MENU | QUIT_TRAY_MENU => app.exit(0),
        AUTOSTART_MENU => toggle_autostart(app),
        _ => {}
    }
}

fn register_shortcut(app: &AppHandle) -> Result<(), Box<dyn Error>> {
    let primary = if cfg!(target_os = "macos") {
        Modifiers::META
    } else {
        Modifiers::CONTROL
    };
    let shortcut = Shortcut::new(Some(primary | Modifiers::ALT | Modifiers::SHIFT), Code::KeyE);
    app.plugin(tauri_plugin_global_shortcut::Builder::new().build())?;
    app.global_shortcut().on_shortcut(shortcut, |app, _, event| {
        if event.state() == ShortcutState::Pressed {
            show_main(app);
        }
    })?;
    Ok(())
}

fn toggle_autostart(app: &AppHandle) {
    let manager = app.autolaunch();
    let result = manager.is_enabled().and_then(|enabled| {
        if enabled {
            manager.disable()
        } else {
            manager.enable()
        }
    });
    let enabled = manager.is_enabled().unwrap_or(false);
    let _ = app.state::<DesktopMenu>().autostart.set_checked(enabled);
    if let Err(error) = result {
        eprintln!("Failed to change ERP autostart setting: {error}");
        show_warning(app, "无法修改开机自启动设置，请检查操作系统的登录项设置后重试。");
    }
}

fn show_shortcut_warning(app: &AppHandle) {
    let shortcut = if cfg!(target_os = "macos") {
        "Command+Option+Shift+E"
    } else {
        "Ctrl+Alt+Shift+E"
    };
    show_warning(app, format!("全局快捷键 {shortcut} 无法注册。可从系统托盘打开 ERP。"));
}

fn show_warning(app: &AppHandle, message: impl Into<String>) {
    let name = app.config().product_name.as_deref().unwrap_or("ZH ERP");
    app.dialog()
        .message(message)
        .title(name)
        .kind(MessageDialogKind::Warning)
        .show(|_| {});
}
