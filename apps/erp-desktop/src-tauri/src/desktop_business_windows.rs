use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::webview::NewWindowResponse;
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};

use crate::{is_local_page, MAIN_WINDOW};

const DETAIL_PAGE: &str = "/desktop-business/index.html";
const REFRESH_EVENT: &str = "erp-business-refresh";
const CHANGED_EVENT: &str = "erp-business-snapshot-changed";
const CLOSED_EVENT: &str = "erp-business-window-closed";
const MAX_WINDOWS: usize = 8;
const MAX_SNAPSHOT_BYTES: usize = 2 * 1024 * 1024;

#[derive(Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub(crate) enum BusinessKind {
    Sales,
    Purchase,
    Product,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct DetailField {
    label: String,
    value: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct DetailImage {
    src: String,
    alt: String,
}

#[derive(Clone, Deserialize, Serialize)]
pub(crate) struct DetailSection {
    title: String,
    #[serde(default)]
    fields: Vec<DetailField>,
    #[serde(default)]
    columns: Vec<String>,
    #[serde(default)]
    rows: Vec<Vec<String>>,
    #[serde(default)]
    images: Vec<DetailImage>,
}

// Display data only. Neither a token, an arbitrary route nor an executable HTML
// fragment belongs in this protocol. The child never receives the raw API object.
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailSnapshot {
    title: String,
    subtitle: String,
    captured_at: String,
    sections: Vec<DetailSection>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshRequest {
    label: String,
    generation: u64,
    request_id: u64,
    kind: BusinessKind,
    id: String,
}

#[derive(Clone, Serialize)]
pub(crate) struct SnapshotState {
    snapshot: DetailSnapshot,
    refreshing: bool,
    error: Option<String>,
}

struct DetailWindow {
    request: RefreshRequest,
    view: SnapshotState,
}

#[derive(Default)]
struct BusinessState {
    page_generation: u64,
    client_revision: u64,
    generation: u64,
    next_window: u64,
    // Memory only, scoped to this application identifier, ERP origin and account.
    account_scope: Option<String>,
    windows: HashMap<String, DetailWindow>,
}

#[derive(Default)]
struct BusinessWindows(Mutex<BusinessState>);

pub(crate) fn init(app: &AppHandle) {
    app.manage(BusinessWindows::default());
}

fn require_main(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != MAIN_WINDOW {
        return Err("此操作仅允许在 ERP 主窗口执行".into());
    }
    Ok(())
}

fn close_windows(app: &AppHandle, labels: Vec<String>) {
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) {
            let _ = window.destroy();
        }
        let _ = app.emit_to(EventTarget::webview_window(MAIN_WINDOW), CLOSED_EVENT, label);
    }
}

// Called whenever the main document starts loading. An old document's pending
// IPC or response cannot establish a session in the replacement document.
pub(crate) fn reset(app: &AppHandle) {
    let Some(state) = app.try_state::<BusinessWindows>() else { return; };
    let labels = {
        let Ok(mut current) = state.0.lock() else { return; };
        current.page_generation += 1;
        current.client_revision = 0;
        current.generation += 1;
        current.account_scope = None;
        current.windows.drain().map(|(label, _)| label).collect()
    };
    close_windows(app, labels);
}

#[tauri::command]
pub(crate) fn desktop_business_context(window: WebviewWindow) -> Result<u64, String> {
    require_main(&window)?;
    let state = window.state::<BusinessWindows>();
    let current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
    Ok(current.page_generation)
}

#[tauri::command]
pub(crate) fn sync_desktop_business_session(
    window: WebviewWindow,
    page_generation: u64,
    revision: u64,
    username: Option<String>,
) -> Result<u64, String> {
    require_main(&window)?;
    let app = window.app_handle();
    let state = app.state::<BusinessWindows>();
    let (generation, labels) = {
        let mut current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
        if page_generation != current.page_generation || revision <= current.client_revision {
            return Err("业务窗口会话已变更".into());
        }
        current.client_revision = revision;
        current.generation += 1;
        current.account_scope = username.filter(|name| !name.trim().is_empty() && name.len() <= 256)
            .map(|name| format!("{}|{}|{name}", app.config().identifier, crate::transport::ERP_ORIGIN));
        let labels = current.windows.drain().map(|(label, _)| label).collect();
        (current.generation, labels)
    };
    close_windows(app, labels);
    Ok(generation)
}

fn validate_snapshot(snapshot: &DetailSnapshot) -> Result<(), String> {
    if snapshot.title.is_empty() || snapshot.title.len() > 512 || snapshot.sections.len() > 32 {
        return Err("业务详情格式无效".into());
    }
    for section in &snapshot.sections {
        if section.columns.len() > 32 || section.fields.len() > 128 || section.rows.len() > 10000 {
            return Err("业务详情内容过多".into());
        }
        for image in &section.images {
            let allowed = tauri::Url::parse(&image.src).ok().is_some_and(|url| {
                url.scheme() == "https" && url.host_str() == Some("server.zhtaero.com")
                    && url.username().is_empty() && url.password().is_none()
                    && url.query().is_none() && url.fragment().is_none()
            });
            if !allowed { return Err("业务图片地址不受支持".into()); }
        }
    }
    if serde_json::to_vec(snapshot).map_err(|_| "业务详情格式无效")?.len() > MAX_SNAPSHOT_BYTES {
        return Err("业务详情超过窗口容量，请在主窗口查看".into());
    }
    Ok(())
}

fn ensure_session(current: &BusinessState, generation: u64) -> Result<(), String> {
    if current.generation != generation || current.account_scope.is_none() {
        return Err("业务窗口会话已失效".into());
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn open_desktop_business_window(
    window: WebviewWindow,
    generation: u64,
    kind: BusinessKind,
    id: String,
    snapshot: DetailSnapshot,
) -> Result<String, String> {
    require_main(&window)?;
    if id.len() != 24 || !id.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Err("业务记录编号无效".into());
    }
    validate_snapshot(&snapshot)?;
    let app = window.app_handle().clone();
    let state = app.state::<BusinessWindows>();
    let title = snapshot.title.clone();
    let (label, existing) = {
        let mut current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
        ensure_session(&current, generation)?;
        if let Some((label, entry)) = current.windows.iter_mut()
            .find(|(_, entry)| entry.request.kind == kind && entry.request.id == id)
        {
            entry.request.request_id += 1;
            entry.view = SnapshotState { snapshot, refreshing: false, error: None };
            (label.clone(), true)
        } else {
            if current.windows.len() >= MAX_WINDOWS {
                return Err("最多同时打开 8 个业务窗口，请先关闭不再需要的窗口".into());
            }
            current.next_window += 1;
            let label = format!("erp-detail-{}", current.next_window);
            current.windows.insert(label.clone(), DetailWindow {
                request: RefreshRequest { label: label.clone(), generation, request_id: 1, kind, id },
                view: SnapshotState { snapshot, refreshing: false, error: None },
            });
            (label, false)
        }
    };
    let child = if existing {
        app.get_webview_window(&label).ok_or("业务窗口正在打开，请稍候")?
    } else {
        // Async commands execute off the WebView2 callback thread; do not create
        // another webview from a synchronous webview/menu callback on Windows.
        let created = WebviewWindowBuilder::new(&app, &label, WebviewUrl::App("desktop-business/index.html".into()))
            .title(&title)
            .inner_size(1080.0, 760.0)
            .min_inner_size(560.0, 400.0)
            .visible(false)
            .devtools(false)
            .use_https_scheme(true)
            .on_navigation(|url| is_local_page(url) && url.path() == DETAIL_PAGE && url.query().is_none())
            .on_new_window(|_, _| NewWindowResponse::Deny)
            .on_download(|_, _| false)
            .build();
        let child = match created {
            Ok(child) => child,
            Err(error) => {
                if let Ok(mut current) = state.0.lock() { current.windows.remove(&label); }
                eprintln!("Failed to create ERP business window: {error}");
                return Err("无法打开独立业务窗口".into());
            }
        };
        let _ = child.remove_menu();
        let handle = app.clone();
        let closed_label = label.clone();
        child.on_window_event(move |event| {
            if matches!(event, WindowEvent::Destroyed) {
                if let Ok(mut current) = handle.state::<BusinessWindows>().0.lock() {
                    current.windows.remove(&closed_label);
                }
                let _ = handle.emit_to(EventTarget::webview_window(MAIN_WINDOW), CLOSED_EVENT, &closed_label);
            }
        });
        child
    };
    let valid = state.0.lock().map(|current| {
        current.generation == generation && current.windows.contains_key(&label)
    }).unwrap_or(false);
    if !valid {
        let _ = child.destroy();
        return Err("业务窗口会话已变更".into());
    }
    let _ = child.set_title(&title);
    let _ = child.emit(CHANGED_EVENT, ());
    let _ = child.unminimize();
    child.show().map_err(|_| "无法显示业务窗口")?;
    let _ = child.set_focus();
    Ok(label)
}

#[tauri::command]
pub(crate) fn list_desktop_business_windows(window: WebviewWindow, generation: u64) -> Result<Vec<RefreshRequest>, String> {
    require_main(&window)?;
    let state = window.state::<BusinessWindows>();
    let current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
    ensure_session(&current, generation)?;
    Ok(current.windows.values().map(|entry| entry.request.clone()).collect())
}

// The supplied label is accepted only from the main window. Children cannot
// select a record: their two commands below resolve the invoking window label.
#[tauri::command]
pub(crate) fn update_desktop_business_window(
    window: WebviewWindow,
    request: RefreshRequestInput,
    snapshot: Option<DetailSnapshot>,
    revoked: bool,
) -> Result<(), String> {
    require_main(&window)?;
    if let Some(snapshot) = &snapshot { validate_snapshot(snapshot)?; }
    let app = window.app_handle();
    let state = app.state::<BusinessWindows>();
    {
        let mut current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
        ensure_session(&current, request.generation)?;
        let entry = current.windows.get_mut(&request.label).ok_or("业务窗口已关闭")?;
        if entry.request.request_id != request.request_id { return Ok(()); }
        if revoked {
            current.windows.remove(&request.label);
        } else {
            entry.view.refreshing = false;
            if let Some(snapshot) = snapshot {
                entry.view.snapshot = snapshot;
                entry.view.error = None;
            } else {
                entry.view.error = Some("刷新失败，以下是上次成功获取的内容，请稍后重试。".into());
            }
        }
    }
    if revoked {
        close_windows(app, vec![request.label]);
    } else if let Some(child) = app.get_webview_window(&request.label) {
        let _ = child.emit(CHANGED_EVENT, ());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RefreshRequestInput {
    label: String,
    generation: u64,
    request_id: u64,
}

#[tauri::command]
pub(crate) fn desktop_business_snapshot(window: WebviewWindow) -> Result<SnapshotState, String> {
    let state = window.state::<BusinessWindows>();
    let current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
    let entry = current.windows.get(window.label()).ok_or("业务窗口会话已失效")?;
    ensure_session(&current, entry.request.generation)?;
    Ok(entry.view.clone())
}

#[tauri::command]
pub(crate) fn refresh_desktop_business_window(window: WebviewWindow) -> Result<(), String> {
    let app = window.app_handle();
    let state = app.state::<BusinessWindows>();
    let request = {
        let mut current = state.0.lock().map_err(|_| "业务窗口状态不可用")?;
        let generation = current.generation;
        ensure_session(&current, generation)?;
        let entry = current.windows.get_mut(window.label()).ok_or("业务窗口已关闭")?;
        if entry.view.refreshing { return Ok(()); }
        entry.request.request_id += 1;
        entry.view.refreshing = true;
        entry.view.error = None;
        entry.request.clone()
    };
    let _ = window.emit(CHANGED_EVENT, ());
    if app.emit_to(EventTarget::webview_window(MAIN_WINDOW), REFRESH_EVENT, &request).is_err() {
        if let Ok(mut current) = state.0.lock() {
            if let Some(entry) = current.windows.get_mut(window.label()) {
                entry.view.refreshing = false;
                entry.view.error = Some("主窗口尚未就绪，请稍后重试。".into());
            }
        }
        let _ = window.emit(CHANGED_EVENT, ());
    }
    Ok(())
}
