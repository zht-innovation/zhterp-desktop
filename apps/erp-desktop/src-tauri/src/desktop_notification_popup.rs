use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::time::Duration;

use tauri::webview::{NewWindowResponse, PageLoadEvent};
use tauri::{AppHandle, LogicalSize, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder};

use crate::{desktop_lifecycle, is_local_page, MAIN_WINDOW};

const POPUP_WINDOW: &str = "erp-notification-popup";
const POPUP_PAGE: &str = "/desktop-notification.html";
const WIDTH: f64 = 380.0;
const HEIGHT: f64 = 190.0;
const MARGIN: f64 = 16.0;
const DISPLAY_DURATION: Duration = Duration::from_secs(10);

#[derive(Default)]
struct PopupState {
    ready: AtomicBool,
    generation: AtomicU64,
}

// Create once during setup: creating a WebView2 window in an event callback can deadlock.
pub(crate) fn setup(app: &AppHandle) -> tauri::Result<()> {
    app.manage(PopupState::default());
    let handle = app.clone();
    let window = WebviewWindowBuilder::new(
        app,
        POPUP_WINDOW,
        WebviewUrl::App("desktop-notification.html".into()),
    )
    .title("ERP 消息提醒")
    .inner_size(WIDTH, HEIGHT)
    .decorations(false)
    .resizable(false)
    .maximizable(false)
    .minimizable(false)
    .closable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .focused(false)
    .focusable(false)
    .visible(false)
    .devtools(false)
    .use_https_scheme(true)
    .on_navigation(move |url| {
        if !is_local_page(url) {
            return false;
        }
        if url.path() == POPUP_PAGE {
            return true;
        }

        let open = url.path() == "/desktop-notification/open";
        if open || url.path() == "/desktop-notification/dismiss" {
            let app = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                hide(&app);
                if open {
                    desktop_lifecycle::show_main(&app);
                }
            });
        }
        false
    })
    .on_new_window(|_, _| NewWindowResponse::Deny)
    .on_download(|_, _| false)
    .on_page_load(|window, payload| {
        if is_local_page(payload.url()) && payload.url().path() == POPUP_PAGE {
            let ready = matches!(payload.event(), PageLoadEvent::Finished);
            window.state::<PopupState>().ready.store(ready, Ordering::Relaxed);
        }
    })
    .build()?;
    // Do not inherit the main window's application menu.
    window.remove_menu()?;
    Ok(())
}

// Called from the notification publisher on the main thread after its existing session checks.
pub(crate) fn show(app: &AppHandle, message: &str) -> Result<(), String> {
    let state = app.state::<PopupState>();
    if !state.ready.load(Ordering::Relaxed) {
        return Err("桌面提示页面尚未就绪".to_owned());
    }
    let window = app
        .get_webview_window(POPUP_WINDOW)
        .ok_or_else(|| "桌面提示窗口不可用".to_owned())?;
    let mut monitor = app
        .get_webview_window(MAIN_WINDOW)
        .and_then(|main| main.current_monitor().ok().flatten());
    if monitor.is_none() {
        monitor = app.primary_monitor().map_err(|error| error.to_string())?;
    }
    let monitor = monitor
        .ok_or_else(|| "无法获取桌面显示器".to_owned())?;
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let width = (WIDTH * scale).round() as i32;
    let height = (HEIGHT * scale).round() as i32;
    let margin = (MARGIN * scale).round() as i32;
    let x = area.position.x + (area.size.width as i32 - width - margin).max(0);
    let y = area.position.y + (area.size.height as i32 - height - margin).max(0);
    window
        .set_position(PhysicalPosition::new(x, y))
        .map_err(|error| error.to_string())?;
    window
        .set_size(LogicalSize::new(WIDTH, HEIGHT))
        .map_err(|error| error.to_string())?;

    let title = app.config().product_name.as_deref().unwrap_or("ZH ERP");
    let title = serde_json::to_string(title).map_err(|error| error.to_string())?;
    let message = serde_json::to_string(message).map_err(|error| error.to_string())?;
    window
        .eval(&format!(
            "document.getElementById('app-name').textContent = {title}; \
             document.getElementById('message').textContent = {message};"
        ))
        .map_err(|error| error.to_string())?;
    window.show().map_err(|error| error.to_string())?;

    let generation = state.generation.fetch_add(1, Ordering::Relaxed) + 1;
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(DISPLAY_DURATION).await;
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            // A previous notification's timer must not hide a newer notification.
            if app.state::<PopupState>().generation.load(Ordering::Relaxed) == generation {
                hide(&app);
            }
        });
    });
    Ok(())
}

pub(crate) fn hide(app: &AppHandle) {
    if let Some(state) = app.try_state::<PopupState>() {
        state.generation.fetch_add(1, Ordering::Relaxed);
    }
    if let Some(window) = app.get_webview_window(POPUP_WINDOW) {
        if let Err(error) = window.hide() {
            eprintln!("Failed to hide ERP desktop notification: {error}");
        }
    }
}
