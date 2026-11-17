#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop_lifecycle;
#[cfg(target_os = "windows")]
mod desktop_notification_popup;
mod desktop_notifications;
mod desktop_updates;
mod desktop_window_state;
mod local_files;
mod session;
mod transport;

use tauri::http::header::{HeaderValue, CONTENT_SECURITY_POLICY};
use tauri::menu::{Menu, MenuItem, MenuItemKind, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse, PageLoadEvent};
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

pub(crate) const MAIN_WINDOW: &str = "erp";
const BACK_MENU: &str = "erp-history-back";

fn chinese_menu_text(text: &str) -> Option<String> {
    let label = text.replace('&', "");
    let translated = match label.as_str() {
        "File" => "文件",
        "Edit" => "编辑",
        "Window" => "窗口",
        "Help" => "帮助",
        "View" => "视图",
        "Undo" => "撤销",
        "Redo" => "重做",
        "Cut" => "剪切",
        "Copy" => "复制",
        "Paste" => "粘贴",
        "Select All" => "全选",
        "Minimize" => "最小化",
        "Maximize" => "最大化",
        "Zoom" => "缩放",
        "Close" | "Close Window" => "关闭窗口",
        "Quit" | "Exit" => "退出",
        "About" => "关于",
        "Services" => "服务",
        "Hide" => "隐藏",
        "Hide Others" => "隐藏其他",
        "Show All" => "全部显示",
        "Toggle Full Screen" => "切换全屏",
        "Fullscreen" | "Enter Fullscreen" | "Enter Full Screen" => "进入全屏",
        "Exit Fullscreen" | "Exit Full Screen" => "退出全屏",
        "Bring All to Front" => "全部置于前台",
        _ => {
            // macOS includes the application name in these native menu labels.
            for (prefix, translation) in [("About ", "关于 "), ("Hide ", "隐藏 "), ("Quit ", "退出 ")] {
                if let Some(name) = text.strip_prefix(prefix) {
                    return Some(format!("{translation}{name}"));
                }
            }
            return None;
        }
    };

    // Preserve Windows access keys, for example Cu&t becomes 剪切(&t).
    if cfg!(target_os = "windows") {
        if let Some((_, suffix)) = text.split_once('&') {
            if let Some(key) = suffix.chars().next() {
                return Some(format!("{translated}(&{key})"));
            }
        }
    }
    Some(translated.to_owned())
}

fn localize_menu_items(items: Vec<MenuItemKind<tauri::Wry>>, app_name: &str) -> tauri::Result<()> {
    for item in items {
        match item {
            MenuItemKind::Submenu(submenu) => {
                let text = submenu.text()?;
                if text != app_name {
                    if let Some(translated) = chinese_menu_text(&text) {
                        submenu.set_text(translated)?;
                    }
                }
                localize_menu_items(submenu.items()?, app_name)?;
            }
            MenuItemKind::Predefined(item) => {
                if let Some(translated) = chinese_menu_text(&item.text()?) {
                    item.set_text(translated)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

fn is_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn is_local_page(url: &Url) -> bool {
    let (scheme, host) = if cfg!(target_os = "windows") {
        ("https", "tauri.localhost")
    } else {
        ("tauri", "localhost")
    };
    url.scheme() == scheme
        && url.host_str() == Some(host)
        && url.port().is_none()
        && url.username().is_empty()
        && url.password().is_none()
}

fn open_external(url: &Url) {
    if is_https(url) && tauri_plugin_opener::open_url(url.as_str(), None::<&str>).is_err() {
        eprintln!("Failed to open an external HTTPS link.");
    }
}

fn main() {
    let start_hidden = std::env::args_os()
        .skip(1)
        .any(|arg| arg == desktop_lifecycle::AUTOSTART_ARG);
    let context = tauri::generate_context!();
    let autostart = tauri_plugin_autostart::Builder::new()
        .app_name(context.config().identifier.clone())
        .arg(desktop_lifecycle::AUTOSTART_ARG)
        .build();
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, args, _| {
            if !args.iter().skip(1).any(|arg| arg == desktop_lifecycle::AUTOSTART_ARG) {
                desktop_lifecycle::show_main(app);
            }
        }))
        .plugin(autostart)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init());
    let builder = if desktop_updates::is_enabled(context.config()) {
        builder
            .plugin(tauri_plugin_updater::Builder::new().build())
            .manage(desktop_updates::DesktopUpdates::default())
    } else {
        builder
    };
    let app = builder
        .invoke_handler(tauri::generate_handler![
            transport::desktop_info,
            desktop_lifecycle::desktop_about_ready,
            desktop_updates::check_desktop_update,
            desktop_updates::install_desktop_update,
            transport::erp_request,
            transport::upload_product_image,
            session::restore_desktop_session,
            session::save_desktop_session,
            session::clear_desktop_session,
            desktop_notifications::sync_desktop_notifications,
            desktop_notifications::refresh_desktop_notifications,
            local_files::open_local_files,
            local_files::save_local_file,
        ])
        .menu(|app| {
            let menu = Menu::default(app)?;
            localize_menu_items(menu.items()?, &app.package_info().name)?;
            let back = MenuItem::with_id(app, BACK_MENU, "返回上一页", true, None::<&str>)?;
            menu.append(&Submenu::with_items(app, "导航", true, &[&back])?)?;
            desktop_lifecycle::append_app_menu(app, &menu)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == BACK_MENU {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.eval("history.back()");
                }
            } else {
                desktop_lifecycle::handle_menu(app, event.id().as_ref());
            }
        })
        .setup(move |app| {
            app.manage(transport::Transport::new()?);
            desktop_window_state::init(app.handle());
            desktop_notifications::start(app.handle());
            let app_handle = app.handle().clone();
            let image_sources = format!("{} {}", transport::IMAGE_ORIGIN, transport::ERP_ORIGIN);

            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::App("index.html".into()))
                .title(app.config().product_name.as_deref().unwrap_or("ZH ERP"))
                .inner_size(1360.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .visible(false)
                .devtools(false)
                .use_https_scheme(true)
                .on_page_load(|window, payload| {
                    if payload.event() == PageLoadEvent::Started {
                        desktop_lifecycle::reset_about_ready(window.app_handle());
                    }
                })
                .on_web_resource_request(move |_, response| {
                    // Preserve the script hashes added by Tauri and add only the built-in ERP image origin.
                    if let Some(csp) = response.headers_mut().get_mut(CONTENT_SECURITY_POLICY) {
                        if let Ok(policy) = csp.to_str() {
                            let policy = policy.replacen(transport::IMAGE_ORIGIN, &image_sources, 1);
                            if let Ok(policy) = HeaderValue::from_str(&policy) {
                                *csp = policy;
                            }
                        }
                    }
                })
                .on_navigation(|url| {
                    if is_local_page(url) {
                        return true;
                    }

                    open_external(url);
                    false
                })
                .on_new_window(move |url, _| {
                    if is_local_page(&url) {
                        let handle = app_handle.clone();
                        let _ = app_handle.run_on_main_thread(move || {
                            if let Some(window) = handle.get_webview_window(MAIN_WINDOW) {
                                let _ = window.navigate(url);
                            }
                        });
                    } else {
                        open_external(&url);
                    }

                    NewWindowResponse::Deny
                })
                .on_download(|_, event| matches!(event, DownloadEvent::Finished { .. }));

            #[cfg(target_os = "windows")]
            let window = window.disable_drag_drop_handler();

            let window = window.build()?;
            desktop_window_state::restore(&window);
            #[cfg(target_os = "windows")]
            if let Err(error) = desktop_notification_popup::setup(app.handle()) {
                eprintln!("Failed to prepare ERP desktop notification window: {error}");
            }
            desktop_lifecycle::setup(app, start_hidden)
        })
        .build(context)
        .expect("failed to start ZH ERP desktop");

    app.run(|app, event| {
        if matches!(event, tauri::RunEvent::ExitRequested { .. } | tauri::RunEvent::Exit) {
            if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                desktop_window_state::save(&window);
            }
        }
        #[cfg(target_os = "macos")]
        if matches!(event, tauri::RunEvent::Reopen { .. }) {
            desktop_lifecycle::show_main(app);
        }
    });
}
