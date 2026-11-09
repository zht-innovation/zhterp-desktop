#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::menu::{Menu, MenuItem, Submenu};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{Manager, Url, WebviewUrl, WebviewWindowBuilder};

const MAIN_WINDOW: &str = "erp";
const BACK_MENU: &str = "erp-history-back";

fn is_https(url: &Url) -> bool {
    url.scheme() == "https"
        && url.host().is_some()
        && url.username().is_empty()
        && url.password().is_none()
}

fn is_erp_blob(url: &Url, erp: &Url) -> bool {
    let Some(blob_url) = url.as_str().strip_prefix("blob:") else {
        return false;
    };

    Url::parse(blob_url).is_ok_and(|inner| is_https(&inner) && inner.origin() == erp.origin())
}

fn is_erp_content(url: &Url, erp: &Url) -> bool {
    (is_https(url) && url.origin() == erp.origin()) || is_erp_blob(url, erp)
}

fn open_external(url: &Url) {
    if is_https(url) && tauri_plugin_opener::open_url(url.as_str(), None::<&str>).is_err() {
        eprintln!("Failed to open an external HTTPS link.");
    }
}

fn main() {
    tauri::Builder::default()
        .menu(|app| {
            let menu = Menu::default(app)?;
            let back = MenuItem::with_id(app, BACK_MENU, "返回上一页", true, None::<&str>)?;
            menu.append(&Submenu::with_items(app, "导航", true, &[&back])?)?;
            Ok(menu)
        })
        .on_menu_event(|app, event| {
            if event.id() == BACK_MENU {
                if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
                    let _ = window.eval("history.back()");
                }
            }
        })
        .setup(|app| {
            let erp = Url::parse(env!("ERP_DESKTOP_ORIGIN"))?;
            let start = erp.join("/configuration")?;
            let navigation_origin = erp.clone();
            let popup_origin = erp.clone();
            let app_handle = app.handle().clone();

            let window = WebviewWindowBuilder::new(app, MAIN_WINDOW, WebviewUrl::External(start))
                .title(app.config().product_name.as_deref().unwrap_or("ZH ERP"))
                .inner_size(1360.0, 860.0)
                .min_inner_size(900.0, 600.0)
                .devtools(false)
                .on_navigation(move |url| {
                    if is_erp_content(url, &navigation_origin) {
                        return true;
                    }

                    open_external(url);
                    false
                })
                .on_new_window(move |url, _| {
                    if is_erp_content(&url, &popup_origin) {
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
                .on_download(move |_, event| match event {
                    // WKWebView exposes the original download URL, so save only
                    // Blob data already created by the trusted ERP origin.
                    DownloadEvent::Requested { url, .. } => is_erp_blob(&url, &erp),
                    DownloadEvent::Finished { .. } => true,
                    _ => false,
                });

            #[cfg(target_os = "windows")]
            let window = window.disable_drag_drop_handler();

            window.build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("failed to start ZH ERP desktop");
}
