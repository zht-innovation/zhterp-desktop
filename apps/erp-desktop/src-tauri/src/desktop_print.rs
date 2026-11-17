use std::{collections::{BTreeMap, BTreeSet}, fs, io::{Read, Write}, sync::Mutex, time::{Duration, SystemTime, UNIX_EPOCH}};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use base64::{engine::general_purpose::STANDARD, Engine};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, EventTarget, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use crate::{desktop_print_native::{self as native, PrintSettings, Printer}, session::token_is_current,
    transport::{Transport, ERP_ORIGIN}, MAIN_WINDOW};

const PAGE: &str = "/desktop-print/index.html";
const MAX_JOBS: usize = 100;
const MAX_HTML: usize = 16 * 1024 * 1024;
const MAX_SAVED_HTML: usize = 64 * 1024 * 1024;
const MAX_HISTORY_BYTES: u64 = 128 * 1024 * 1024;
const AUTH_CONCURRENCY: usize = 8;
const MAX_SAFE_SERIAL: u64 = 9_007_199_254_740_991;

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SnBatch {
    pub month_key: String,
    pub first_serial: u64,
    pub last_serial: u64,
    pub codes: Vec<String>,
    // pending -> registering -> registered OR unknown. Never automatically retry
    // the existing non-idempotent business registration endpoint.
    pub registration: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrintDocument {
    pub kind: String,
    pub title: String,
    pub source_ids: Vec<String>,
    pub pages: Vec<String>,
    pub sn_batch: Option<SnBatch>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrintJob {
    id: String,
    parent_id: Option<String>,
    created_at: u64,
    status: String,
    message: String,
    #[serde(default)]
    permission_stamp: String,
    document: PrintDocument,
    settings: PrintSettings,
    #[serde(skip)]
    ready: bool,
    #[serde(default)]
    preview_revision: u64,
    #[serde(skip)]
    render_error: Option<String>,
    #[serde(skip)]
    preview_building: bool,
}

#[derive(Default, Deserialize, Serialize)]
struct SavedPrints {
    jobs: Vec<PrintJob>,
    preferences: BTreeMap<String, PrintSettings>,
}

#[derive(Default)]
struct PrintState {
    revision: u64,
    token: String,
    scope: String,
    saved: SavedPrints,
    worker: bool,
    next_id: u64,
    history_warning: String,
}

#[derive(Default)]
pub(crate) struct DesktopPrintState(Mutex<PrintState>);

#[derive(Serialize)]
pub(crate) struct PrintList {
    jobs: Vec<PrintJob>,
    preferences: BTreeMap<String, PrintSettings>,
    warning: String,
}

fn main_only(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != MAIN_WINDOW { return Err("仅允许从 ERP 主窗口操作打印中心".into()); }
    Ok(())
}

fn now() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn changed(app: &AppHandle) { let _ = app.emit_to(EventTarget::webview_window(MAIN_WINDOW), "erp-print-changed", ()); }
fn path(app: &AppHandle, scope: &str) -> Result<std::path::PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("print-center").join(format!("{scope}.json")))
}

fn valid_source_id(id: &str) -> bool {
    id.len() == 24 && id.bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn validate_document(document: &PrintDocument, preparing: bool) -> Result<(), String> {
    if !matches!(document.kind.as_str(), "sales" | "sku" | "sn") || document.source_ids.is_empty()
        || document.source_ids.len() > 100 || !document.source_ids.iter().all(|id| valid_source_id(id))
        || document.pages.is_empty() || document.pages.len() > 2000
        || document.pages.iter().map(String::len).sum::<usize>() > MAX_HTML || document.title.len() > 200 {
        return Err("打印内容、业务编号或批次数量无效".into());
    }
    if document.kind != "sn" {
        if document.sn_batch.is_some() { return Err("非 SN 任务不能携带流水登记信息".into()); }
        return Ok(());
    }
    let batch = document.sn_batch.as_ref().ok_or("SN 批次信息缺失")?;
    let month = batch.month_key.as_bytes();
    let valid_month = month.len() == 7 && month[4] == b'-'
        && month[..4].iter().all(u8::is_ascii_digit)
        && matches!(&batch.month_key[5..], "01" | "02" | "03" | "04" | "05" | "06" | "07" | "08" | "09" | "10" | "11" | "12");
    if document.source_ids.len() != 1 || !valid_month || batch.codes.is_empty()
        || batch.codes.len() != document.pages.len()
        || !batch.codes.iter().all(|code| !code.is_empty() && code.len() <= 200 && code.is_ascii())
        || batch.first_serial == 0 || batch.last_serial > MAX_SAFE_SERIAL
        || batch.last_serial.checked_sub(batch.first_serial).and_then(|count| count.checked_add(1)) != Some(batch.codes.len() as u64)
        || !matches!(batch.registration.as_str(), "pending" | "registering" | "registered" | "unknown" | "rejected")
        || (preparing && batch.registration != "pending") {
        return Err("SN 批次信息无效".into());
    }
    Ok(())
}

fn valid_saved_settings(settings: &PrintSettings) -> bool {
    !settings.printer.is_empty() && settings.printer.len() <= 1024
        && !settings.paper.id.is_empty() && settings.paper.id.len() <= 1024 && settings.paper.name.len() <= 1024
        && settings.paper.width_mm.is_finite() && settings.paper.width_mm > 0.0
        && settings.paper.height_mm.is_finite() && settings.paper.height_mm > 0.0
        && (1..=99).contains(&settings.copies)
}

fn valid_job_id(id: &str) -> bool {
    id.len() <= 80 && id.split_once('-').is_some_and(|(time, sequence)|
        !time.is_empty() && !sequence.is_empty()
        && time.bytes().all(|byte| byte.is_ascii_digit()) && sequence.bytes().all(|byte| byte.is_ascii_digit()))
}

// Keep usable records, but preserve the entire original file before any cleaned
// history is written. In particular, uncertain SN registrations are never lost.
fn clean_history(saved: &mut SavedPrints) -> bool {
    let mut invalid = false;
    let mut ids = BTreeSet::new();
    let mut html_bytes = 0;
    saved.jobs.retain(|job| {
        let size: usize = job.document.pages.iter().map(String::len).sum();
        let valid = ids.len() < MAX_JOBS && html_bytes + size <= MAX_SAVED_HTML
            && valid_job_id(&job.id) && !ids.contains(&job.id)
            && job.parent_id.as_ref().is_none_or(|id| valid_job_id(id))
            && matches!(job.status.as_str(), "draft" | "waiting" | "submitting" | "submitted" | "failed" | "unknown" | "cancelled")
            && job.message.len() <= 8192 && job.permission_stamp.len() <= 4096 && job.preview_revision < u64::MAX
            && valid_saved_settings(&job.settings) && validate_document(&job.document, false).is_ok();
        if valid { ids.insert(job.id.clone()); html_bytes += size; }
        else { invalid = true; }
        valid
    });
    saved.preferences.retain(|kind, settings| {
        let valid = matches!(kind.as_str(), "sales" | "sku" | "sn") && valid_saved_settings(settings);
        if !valid { invalid = true; }
        valid
    });
    invalid
}

fn load_history(app: &AppHandle, scope: &str) -> Result<(SavedPrints, String), String> {
    let history_path = path(app, scope)?;
    let root = history_path.parent().ok_or("打印记录路径无效")?;
    let mut saved = SavedPrints::default();
    let mut invalid = false;
    match fs::File::open(&history_path) {
        Ok(file) => {
            let size = file.metadata().map_err(|_| "无法读取打印记录信息，请检查文件权限后重试；原记录未改动")?.len();
            if size > MAX_HISTORY_BYTES { invalid = true; }
            else {
                // The file can grow after metadata(), so also bound the read.
                let mut bytes = Vec::new();
                file.take(MAX_HISTORY_BYTES + 1).read_to_end(&mut bytes)
                    .map_err(|_| "无法读取打印记录，请检查文件权限后重试；原记录未改动")?;
                if bytes.len() as u64 > MAX_HISTORY_BYTES { invalid = true; }
                else {
                    match serde_json::from_slice::<SavedPrints>(&bytes) {
                        Ok(mut history) => {
                            invalid = clean_history(&mut history);
                            saved = history;
                        }
                        Err(_) => invalid = true,
                    }
                }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("无法打开打印记录，请检查文件权限后重试；原记录未改动".into()),
    }
    let backup_prefix = format!("{scope}.history-backup-");
    if invalid {
        // Keep the complete original, including uncertain SN registrations.
        // Never replace an existing backup or clear a file that cannot be moved.
        let mut sequence = 0;
        let backup_path = loop {
            let candidate = root.join(format!("{backup_prefix}{}-{sequence}.json", now()));
            if !candidate.try_exists().map_err(|_| "无法检查打印记录备份路径，原记录未改动")? { break candidate; }
            sequence += 1;
        };
        fs::rename(&history_path, &backup_path)
            .map_err(|_| "打印历史已损坏或超限，但无法保留原文件；请检查文件权限后重试，原记录未改动")?;
    }
    // Derive the persistent warning from the backups themselves. It survives
    // even if saving the new history fails after the original was preserved.
    let mut backup_found = false;
    match fs::read_dir(root) {
        Ok(entries) => {
            for entry in entries {
                let entry = entry.map_err(|_| "无法检查打印历史备份，请检查目录权限后重试")?;
                if entry.file_name().to_string_lossy().starts_with(&backup_prefix) { backup_found = true; break; }
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => {}
        Err(_) => return Err("无法检查打印历史备份，请检查目录权限后重试".into()),
    }
    let warning = if backup_found {
        format!("打印历史曾损坏或超限，原文件完整保留在 {} 中的 {backup_prefix}*.json。当前使用可读取的记录；请联系管理员核查备份中的 SN 登记及打印结果，勿直接重新登记或重打未确认批次。", root.display())
    } else { String::new() };
    Ok((saved, warning))
}

// Called only while holding PrintState's mutex, so older writes cannot replace
// newer snapshots. Persist the uncertainty marker BEFORE any side effect.
fn save(app: &AppHandle, state: &PrintState) -> Result<(), String> {
    if state.scope.is_empty() { return Ok(()); }
    let path = path(app, &state.scope)?;
    let root = path.parent().ok_or("打印记录路径无效")?;
    fs::create_dir_all(root).map_err(|_| "无法创建打印记录目录")?;
    let bytes = serde_json::to_vec(&state.saved).map_err(|_| "无法序列化打印记录")?;
    if bytes.len() as u64 > MAX_HISTORY_BYTES { return Err("打印历史超过 128 MB，请先删除不再需要的记录".into()); }
    let mut temp = tempfile::NamedTempFile::new_in(root).map_err(|_| "无法保存打印记录")?;
    temp.write_all(&bytes).and_then(|_| temp.as_file().sync_all()).map_err(|_| "无法保存打印记录")?;
    temp.persist(path).map_err(|_| "无法替换打印记录文件")?;
    Ok(())
}

fn session(state: &PrintState) -> Result<(u64, String), String> {
    if state.scope.is_empty() || !token_is_current(&state.token) { return Err("请先登录后打开打印中心".into()); }
    Ok((state.revision, state.token.clone()))
}

struct ResourceError {
    // Only explicit 403/404 responses may fall back to another existing view.
    status: Option<u16>,
    message: String,
}

fn resource_error(status: u16, value: Option<&Value>) -> ResourceError {
    let reason = match status {
        400 => "打印校验参数不合法，请从业务页面重新生成",
        401 => "登录已过期，请重新登录",
        403 => "当前账号无权访问此记录",
        404 => "业务记录已不存在或不可访问",
        429 => "打印校验请求过于频繁，请稍后重试",
        500..=599 => "业务服务暂不可用，请稍后重试打印校验",
        _ => "业务服务返回异常状态，无法完成打印校验",
    };
    let detail = value.and_then(|value| value["msg"].as_str()).unwrap_or("")
        .chars().filter(|ch| !ch.is_control()).take(160).collect::<String>();
    let message = if detail.is_empty() { format!("{reason}（{status}）") }
        else { format!("{reason}（{status}）：{detail}") };
    ResourceError { status: Some(status), message }
}

async fn resource_result(app: &AppHandle, token: &str, route: &str) -> Result<Value, ResourceError> {
    if !token_is_current(token) { return Err(resource_error(401, None)); }
    let (status, bytes) = app.state::<Transport>().desktop_print_resource_get(route, token).await
        .map_err(|error| ResourceError { status: None, message: format!("打印校验请求失败：{error}") })?;
    if !token_is_current(token) { return Err(resource_error(401, None)); }
    let parsed = serde_json::from_slice::<Value>(&bytes);
    if status != 200 { return Err(resource_error(status, parsed.as_ref().ok())); }
    let value = parsed.map_err(|_| ResourceError { status: None, message: "业务服务响应格式异常，无法完成打印校验，请稍后重试".into() })?;
    if value["code"].as_u64() != Some(200) {
        let code = value["code"].as_u64().and_then(|code| u16::try_from(code).ok()).unwrap_or(0);
        return Err(resource_error(code, Some(&value)));
    }
    Ok(value["data"].clone())
}

async fn resource(app: &AppHandle, token: &str, route: &str) -> Result<Value, String> {
    resource_result(app, token, route).await.map_err(|error| error.message)
}

async fn authorize_source(app: &AppHandle, token: &str, kind: &str, id: &str) -> Result<(), String> {
    if kind == "sales" {
        // All three modes retain the server's existing role/ownership/approval
        // filters. A failed service request is never treated as a permission miss.
        for mode in ["", "&draftOnly=true", "&approvalOnly=true&approvalResult=all"] {
            match resource_result(app, token, &format!("/sales-order/retrieve?id={id}&limit=1{mode}")).await {
                Ok(data) => {
                    let orders = data["list"].as_array().ok_or("订单服务响应格式异常，请稍后重试打印校验")?;
                    if orders.iter().any(|order| order["_id"].as_str().or(order["id"].as_str())
                        .is_some_and(|found| found.eq_ignore_ascii_case(id))) { return Ok(()); }
                }
                Err(error) if matches!(error.status, Some(403 | 404)) => continue,
                Err(error) => return Err(error.message),
            }
        }
        return Err(format!("销售订单 {id} 已不可访问，不能打印历史快照"));
    }
    let data = resource(app, token, &format!("/inventory/product/detail?id={id}")).await?;
    if !data["detail"].is_object() { return Err("产品服务响应格式异常，请稍后重试打印校验".into()); }
    Ok(())
}

async fn authorize(app: &AppHandle, token: &str, document: &PrintDocument) -> Result<String, String> {
    validate_document(document, false)?;
    let profile = resource(app, token, "/admin/profile").await?;
    if profile["user"]["role"].is_null() { return Err("账号服务响应格式异常，无法完成打印校验".into()); }
    let permission_stamp = profile["user"]["role"].to_string();
    // At most eight IDs are checked together, each ID retaining ordered view
    // fallback. Dropping JoinSet on an error cancels the remaining reads.
    for ids in document.source_ids.chunks(AUTH_CONCURRENCY) {
        let mut checks = tokio::task::JoinSet::new();
        for id in ids {
            let app = app.clone();
            let token = token.to_owned();
            let kind = document.kind.clone();
            let id = id.clone();
            checks.spawn(async move { authorize_source(&app, &token, &kind, &id).await });
        }
        while let Some(result) = checks.join_next().await {
            result.map_err(|_| "打印权限校验中断，请稍后重试")??;
        }
    }
    Ok(permission_stamp)
}

async fn authorize_job(app: &AppHandle, token: &str, job: &PrintJob) -> Result<(), String> {
    let current = authorize(app, token, &job.document).await?;
    if current != job.permission_stamp {
        return Err("账号权限已变化，请从业务页面重新生成打印内容，不能使用旧权限下的快照".into());
    }
    Ok(())
}

pub(crate) fn reset(app: &AppHandle) -> Option<u64> {
    let state = app.try_state::<DesktopPrintState>()?;
    let (revision, labels) = {
        let mut current = state.0.lock().ok()?;
        for job in &mut current.saved.jobs {
            if matches!(job.status.as_str(), "waiting" | "submitting") {
                job.status = "unknown".into();
                job.message = "会话结束，提交结果需人工核实；不会自动重打".into();
            }
        }
        let _ = save(app, &current);
        current.revision += 1;
        current.token.clear();
        current.scope.clear();
        current.saved = SavedPrints::default();
        current.history_warning.clear();
        current.worker = false;
        let labels: Vec<_> = app.webview_windows().into_keys().filter(|label| label.starts_with("print-")).collect();
        (current.revision, labels)
    };
    for label in labels {
        if let Some(window) = app.get_webview_window(&label) { let _ = window.destroy(); }
    }
    Some(revision)
}

#[tauri::command]
pub(crate) async fn desktop_print_bind_session(app: AppHandle, window: WebviewWindow, token: Option<String>) -> Result<(), String> {
    main_only(&window)?;
    {
        let state = app.state::<DesktopPrintState>();
        let current = state.0.lock().map_err(|_| "打印状态不可用")?;
        if !current.scope.is_empty() && token.as_deref() == Some(current.token.as_str()) && token_is_current(&current.token) {
            return Ok(());
        }
    }
    let revision = reset(&app).ok_or("打印状态不可用")?;
    let Some(token) = token.filter(|t| !t.is_empty()) else { return Ok(()); };
    let profile = resource(&app, &token, "/admin/profile").await?;
    let username = profile["user"]["username"].as_str().filter(|name| !name.is_empty()).ok_or("账号信息无效")?;
    let scope = format!("{:x}", Sha256::digest(format!("{}\0{}\0{}", app.config().identifier, ERP_ORIGIN, username)));
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    let (mut saved, warning) = load_history(&app, &scope)?;
    for job in &mut saved.jobs {
        if matches!(job.status.as_str(), "waiting" | "submitting") { job.status = "unknown".into(); job.message = "应用曾中断，请先检查系统打印队列，再决定是否重打".into(); }
        if let Some(batch) = &mut job.document.sn_batch {
            if batch.registration == "registering" { batch.registration = "unknown".into(); }
        }
    }
    current.token = token;
    current.scope = scope;
    current.saved = saved;
    current.history_warning = warning;
    if let Err(error) = save(&app, &current) {
        // A later bind must retry persistence, not treat this as a ready session.
        current.token.clear();
        current.scope.clear();
        return Err(error);
    }
    drop(current);
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_printers(window: WebviewWindow) -> Result<Vec<Printer>, String> {
    main_only(&window)?;
    tauri::async_runtime::spawn_blocking(native::printers).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub(crate) async fn desktop_print_image(app: AppHandle, window: WebviewWindow, url: String) -> Result<String, String> {
    main_only(&window)?;
    let (revision, _) = {
        let state = app.state::<DesktopPrintState>();
        let current = state.0.lock().map_err(|_| "打印状态不可用")?;
        session(&current)?
    };
    let url = tauri::Url::parse(&url).map_err(|_| "打印图片地址无效")?;
    if url.origin().ascii_serialization() != "https://server.zhtaero.com" || !url.username().is_empty() || url.password().is_some() {
        return Err("打印图片地址不在已有图床范围内".into());
    }
    // Public product pictures use the existing img-src origin. This independent
    // client has no cookie jar and never receives an ERP token or auth headers.
    let client = reqwest::Client::builder().https_only(true).redirect(reqwest::redirect::Policy::none())
        .timeout(Duration::from_secs(30)).build().map_err(|_| "图片客户端不可用")?;
    let mut response = client.get(url).send().await.map_err(|_| "打印图片读取失败")?;
    if !response.status().is_success() { return Err("打印图片已不可访问".into()); }
    let mime = response.headers().get(reqwest::header::CONTENT_TYPE).and_then(|value| value.to_str().ok())
        .unwrap_or("").split(';').next().unwrap_or("").trim().to_owned();
    if !matches!(mime.as_str(), "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "image/bmp") { return Err("打印图片格式不支持".into()); }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(|_| "打印图片读取中断")? {
        if bytes.len() + chunk.len() > 8 * 1024 * 1024 { return Err("打印图片超过 8 MB".into()); }
        bytes.extend_from_slice(&chunk);
    }
    if app.state::<DesktopPrintState>().0.lock().map_err(|_| "打印状态不可用")?.revision != revision { return Err("登录会话已变化".into()); }
    Ok(format!("data:{mime};base64,{}", STANDARD.encode(bytes)))
}

#[tauri::command]
pub(crate) fn desktop_print_list(app: AppHandle, window: WebviewWindow) -> Result<PrintList, String> {
    main_only(&window)?;
    let state = app.state::<DesktopPrintState>();
    let current = state.0.lock().map_err(|_| "打印状态不可用")?;
    session(&current)?;
    // The ERP page needs metadata only. Full documents stay in the local renderer.
    let mut jobs = current.saved.jobs.clone();
    for job in &mut jobs { job.document.pages.clear(); }
    Ok(PrintList { jobs, preferences: current.saved.preferences.clone(), warning: current.history_warning.clone() })
}

#[tauri::command]
pub(crate) async fn desktop_print_settings(app: AppHandle, window: WebviewWindow, kind: String, settings: PrintSettings) -> Result<(), String> {
    main_only(&window)?;
    if !matches!(kind.as_str(), "sales" | "sku" | "sn") { return Err("打印类型无效".into()); }
    let (revision, _) = {
        let state = app.state::<DesktopPrintState>();
        let current = state.0.lock().map_err(|_| "打印状态不可用")?;
        session(&current)?
    };
    native::validate(&settings, &desktop_print_printers(window).await?)?;
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    current.saved.preferences.insert(kind, settings);
    save(&app, &current)?;
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_prepare(app: AppHandle, window: WebviewWindow, document: PrintDocument, settings: PrintSettings) -> Result<String, String> {
    main_only(&window)?;
    validate_document(&document, true)?;
    let (revision, token) = {
        let state = app.state::<DesktopPrintState>();
        let current = state.0.lock().map_err(|_| "打印状态不可用")?;
        session(&current)?
    };
    native::validate(&settings, &desktop_print_printers(window.clone()).await?)?;
    let permission_stamp = authorize(&app, &token, &document).await?;
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    if current.saved.jobs.len() >= MAX_JOBS { return Err("打印记录已达 100 条，请在打印中心删除已完成记录后继续") .map_err(str::to_owned); }
    if current.saved.jobs.iter().flat_map(|job| &job.document.pages).map(String::len).sum::<usize>()
        + document.pages.iter().map(String::len).sum::<usize>() > MAX_SAVED_HTML {
        return Err("打印快照存储已达 64 MB，请先删除不再需要重打的记录".into());
    }
    current.next_id += 1;
    let id = format!("{}-{}", now(), current.next_id);
    current.saved.preferences.insert(document.kind.clone(), settings.clone());
    current.saved.jobs.push(PrintJob { id: id.clone(), parent_id: None, created_at: now(), status: "draft".into(), message: String::new(), permission_stamp, document, settings, ready: false, preview_revision: 0, render_error: None, preview_building: false });
    if let Err(error) = save(&app, &current) { current.saved.jobs.pop(); return Err(error); }
    drop(current);
    changed(&app);
    Ok(id)
}

fn job_snapshot(app: &AppHandle, id: &str) -> Result<(u64, String, PrintJob), String> {
    let state = app.state::<DesktopPrintState>();
    let current = state.0.lock().map_err(|_| "打印状态不可用")?;
    let (revision, token) = session(&current)?;
    let job = current.saved.jobs.iter().find(|job| job.id == id).cloned().ok_or("打印任务不存在")?;
    Ok((revision, token, job))
}

async fn preview(app: &AppHandle, id: &str, retry: bool) -> Result<(), String> {
    let (revision, token, job) = job_snapshot(app, id)?;
    authorize_job(app, &token, &job).await?;
    let label = format!("print-{id}");
    let (preview_revision, existing) = {
        let state = app.state::<DesktopPrintState>();
        let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
        if current.revision != revision { return Err("登录会话已变化".into()); }
        let stored = current.saved.jobs.iter_mut().find(|job| job.id == id).ok_or("打印任务不存在")?;
        if stored.preview_building { return Err("预览正在生成，请稍后重试".into()); }
        let existing = app.get_webview_window(&label);
        let queued = matches!(stored.status.as_str(), "waiting" | "submitting");
        if let Some(window) = &existing {
            if !retry || stored.ready || queued {
                drop(current);
                let _ = window.show();
                let _ = window.set_focus();
                return Ok(());
            }
        }
        if queued { return Err("任务已进入打印队列，不能重建预览；请等待本次结果后再明确重打".into()); }
        // Reserve rebuilding before releasing the lock. Submission cannot queue
        // this job while its old window is being destroyed or its new one built.
        stored.preview_building = true;
        stored.ready = false;
        stored.preview_revision += 1;
        stored.render_error = None;
        if stored.status == "draft" { stored.message.clear(); }
        (stored.preview_revision, existing)
    };
    let result: Result<WebviewWindow, String> = (|| {
        if let Some(window) = existing { window.destroy().map_err(|_| "无法关闭失败的预览，请关闭预览窗口后重试")?; }
        WebviewWindowBuilder::new(app, &label, WebviewUrl::App(PAGE.trim_start_matches('/').into()))
            .title(format!("打印预览 · {}", job.document.title)).inner_size(980.0, 760.0)
            .use_https_scheme(true).devtools(false)
            .on_navigation(|url| crate::is_local_page(url) && url.path() == PAGE)
            .on_new_window(|_, _| tauri::webview::NewWindowResponse::Deny)
            .on_download(|_, _| false)
            .build().map_err(|error| error.to_string())
    })();
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision || !current.saved.jobs.iter().any(|job| job.id == id && job.preview_revision == preview_revision) {
        drop(current);
        if let Ok(window) = result { let _ = window.destroy(); }
        return Err("登录会话已变化".into());
    }
    let stored = current.saved.jobs.iter_mut().find(|job| job.id == id).ok_or("打印任务不存在")?;
    stored.preview_building = false;
    if let Err(error) = &result {
        stored.render_error = Some(error.clone());
        if stored.status == "draft" { stored.message = error.clone(); }
    }
    drop(current);
    changed(app);
    let window = result?;
    let _ = window.remove_menu();
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_preview(app: AppHandle, window: WebviewWindow, id: String, retry: Option<bool>) -> Result<(), String> {
    main_only(&window)?;
    preview(&app, &id, retry.unwrap_or(false)).await
}

#[tauri::command]
pub(crate) fn desktop_print_payload(app: AppHandle, window: WebviewWindow) -> Result<PrintJob, String> {
    if !window.url().is_ok_and(|url| crate::is_local_page(&url) && url.path() == PAGE) { return Err("打印页面来源无效".into()); }
    let id = window.label().strip_prefix("print-").ok_or("打印窗口无效")?;
    Ok(job_snapshot(&app, id)?.2)
}

#[tauri::command]
pub(crate) fn desktop_print_ready(app: AppHandle, window: WebviewWindow, preview_revision: u64, error: Option<String>) -> Result<(), String> {
    let id = window.label().strip_prefix("print-").ok_or("打印窗口无效")?;
    if !window.url().is_ok_and(|url| crate::is_local_page(&url) && url.path() == PAGE) { return Err("打印页面来源无效".into()); }
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    session(&current)?;
    let job = current.saved.jobs.iter_mut().find(|job| job.id == id).ok_or("打印任务不存在")?;
    if job.preview_revision != preview_revision { return Err("此预览已经重建，请使用当前预览") .map_err(str::to_owned); }
    job.ready = error.is_none();
    job.render_error = error.map(|error| error.chars().take(200).collect());
    if job.status == "draft" { job.message = job.render_error.clone().unwrap_or_default(); }
    drop(current);
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_registration(app: AppHandle, window: WebviewWindow, id: String, action: String) -> Result<(), String> {
    main_only(&window)?;
    let (revision, token, job) = job_snapshot(&app, &id)?;
    if action == "start" || action == "confirm" { authorize_job(&app, &token, &job).await?; }
    let batch = job.document.sn_batch.as_ref().ok_or("此任务不是 SN 批次")?;
    if action == "start" || action == "confirm" {
        let source_id = job.document.source_ids.first().filter(|id| valid_source_id(id)).ok_or("SN 批次缺少有效产品编号，请从产品页面重新生成")?;
        let data = resource(&app, &token, &format!("/inventory/product/detail?id={source_id}")).await?;
        let state = &data["detail"]["snPrintState"];
        let same_month = state["monthKey"].as_str() == Some(batch.month_key.as_str());
        let last_serial = state["lastSerial"].as_u64().unwrap_or(0);
        if action == "start" && state["monthKey"].as_str().is_some_and(|month| month > batch.month_key.as_str()) {
            return Err("服务器已进入新的 SN 月份，请取消此旧月份批次并重新生成".into());
        }
        if action == "start" && same_month && last_serial >= batch.first_serial {
            return Err("此冻结批次已与服务器流水重叠，请取消并重新生成。实际登记仍由服务端原子条件更新保护".into());
        }
        if action == "confirm" && (!same_month || last_serial < batch.last_serial) {
            return Err("服务器流水状态尚未覆盖此批次，不能确认登记；请人工核查，勿重复登记".into());
        }
    }
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    let batch = current.saved.jobs.iter_mut().find(|job| job.id == id).and_then(|job| job.document.sn_batch.as_mut()).ok_or("SN 批次不存在")?;
    batch.registration = match (action.as_str(), batch.registration.as_str()) {
        ("start", "pending") => "registering",
        ("confirm", "registering" | "unknown") => "registered",
        ("unknown", "registering") => "unknown",
        ("reject", "registering") => "rejected",
        _ => return Err("此批次已经登记或登记结果待核查，不可重复登记".into()),
    }.into();
    save(&app, &current)?;
    drop(current);
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_submit(app: AppHandle, window: WebviewWindow, id: String) -> Result<(), String> {
    main_only(&window)?;
    let (revision, _, job) = job_snapshot(&app, &id)?;
    if job.status != "draft" { return Err("此任务已提交；如需再次打印，请明确选择重打".into()); }
    if job.document.sn_batch.as_ref().is_some_and(|batch| batch.registration != "registered") { return Err("SN 登记尚未确认，请先核查批次状态") .map_err(str::to_owned); }
    native::validate(&job.settings, &desktop_print_printers(window).await?)?;
    // An existing preview has already been authorized. Do not repeat the same
    // checks twice on enqueue: submit_one always rechecks live permissions just
    // before the native side effect, including after any queue wait.
    if app.get_webview_window(&format!("print-{id}")).is_none() {
        preview(&app, &id, false).await?;
    }
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    let job = current.saved.jobs.iter_mut().find(|job| job.id == id).ok_or("打印任务不存在")?;
    if job.status != "draft" { return Err("此任务已经提交".into()); }
    if job.preview_building { return Err("预览正在生成，请稍后再提交".into()); }
    job.status = "waiting".into();
    if let Err(error) = save(&app, &current) {
        // Roll back while holding the same mutex used by the queue scanner.
        // Neither an existing nor a later worker may see a failed enqueue.
        if let Some(job) = current.saved.jobs.iter_mut().find(|job| job.id == id) { job.status = "draft".into(); }
        return Err(error);
    }
    if !current.worker {
        current.worker = true;
        let handle = app.clone();
        tauri::async_runtime::spawn(async move { run_queue(handle, revision).await; });
    }
    drop(current);
    changed(&app);
    Ok(())
}

async fn run_queue(app: AppHandle, revision: u64) {
    loop {
        let job = {
            let state = app.state::<DesktopPrintState>();
            let Ok(mut current) = state.0.lock() else { return; };
            if current.revision != revision { return; }
            match current.saved.jobs.iter().find(|job| job.status == "waiting").cloned() {
                Some(job) => job,
                None => { current.worker = false; return; }
            }
        };
        let outcome = submit_one(&app, revision, &job).await;
        let state = app.state::<DesktopPrintState>();
        let Ok(mut current) = state.0.lock() else { return; };
        if current.revision != revision { return; }
        if let Some(stored) = current.saved.jobs.iter_mut().find(|stored| stored.id == job.id) {
            if stored.status != "cancelled" {
                let was_submitting = stored.status == "submitting";
                match outcome {
                    Ok(()) => { stored.status = "submitted".into(); stored.message = "系统已接受任务，不代表纸张已实际输出".into(); }
                    Err(error) => { stored.status = if was_submitting { "unknown" } else { "failed" }.into(); stored.message = error; }
                }
            }
        }
        let _ = save(&app, &current);
        drop(current);
        if let Some(window) = app.get_webview_window(&format!("print-{}", job.id)) { let _ = window.destroy(); }
        changed(&app);
    }
}

async fn submit_one(app: &AppHandle, revision: u64, job: &PrintJob) -> Result<(), String> {
    // Readiness includes all fonts, images and pre-rendered SVG bars. No native
    // submission is allowed if the preview closes or reports a rendering error.
    let mut ready_revision = None;
    for _ in 0..150 {
        {
            let state = app.state::<DesktopPrintState>();
            let current = state.0.lock().map_err(|_| "打印状态不可用")?;
            if current.revision != revision { return Err("登录会话已变化".into()); }
            let stored = current.saved.jobs.iter().find(|stored| stored.id == job.id).ok_or("任务已移除")?;
            if stored.status != "waiting" { return Err("任务已取消".into()); }
            if let Some(error) = &stored.render_error { return Err(error.clone()); }
            if stored.ready && !stored.preview_building { ready_revision = Some(stored.preview_revision); break; }
        }
        if app.get_webview_window(&format!("print-{}", job.id)).is_none() { return Err("打印预览已关闭，未提交任务".into()); }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    let ready_revision = ready_revision.ok_or("打印页面未能完成渲染，未提交任务")?;
    let (_, token, _) = job_snapshot(app, &job.id)?;
    authorize_job(app, &token, job).await?;
    let printers = tauri::async_runtime::spawn_blocking(native::printers).await.map_err(|e| e.to_string())??;
    native::validate(&job.settings, &printers)?;
    let window = {
        let state = app.state::<DesktopPrintState>();
        let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
        if current.revision != revision { return Err("登录会话已变化".into()); }
        let stored = current.saved.jobs.iter_mut().find(|stored| stored.id == job.id).ok_or("任务已移除")?;
        if stored.status != "waiting" { return Err("任务已取消".into()); }
        if stored.preview_revision != ready_revision || !stored.ready || stored.preview_building {
            return Err("打印预览已变化或未就绪，未提交任务".into());
        }
        if let Some(error) = &stored.render_error { return Err(error.clone()); }
        let window = app.get_webview_window(&format!("print-{}", job.id)).ok_or("打印预览已关闭，未提交任务")?;
        stored.status = "submitting".into();
        if let Err(error) = save(app, &current) {
            // No native call occurred. Let run_queue mark this as failed rather
            // than claiming that the physical submission result is unknown.
            if let Some(stored) = current.saved.jobs.iter_mut().find(|stored| stored.id == job.id) { stored.status = "waiting".into(); }
            return Err(error);
        }
        window
    };
    changed(app);
    tokio::time::timeout(Duration::from_secs(120), native::submit(&window, job.settings.clone())).await
        .map_err(|_| "原生打印回调超时，结果未知；请先检查系统打印队列，勿直接重打".to_owned())?
}

#[tauri::command]
pub(crate) fn desktop_print_cancel(app: AppHandle, window: WebviewWindow, id: String, remove: bool) -> Result<(), String> {
    main_only(&window)?;
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    session(&current)?;
    let job = current.saved.jobs.iter_mut().find(|job| job.id == id).ok_or("打印任务不存在")?;
    if job.status == "submitting" { return Err("任务正在提交，请在系统打印队列中处理") .map_err(str::to_owned); }
    if remove { current.saved.jobs.retain(|job| job.id != id); }
    else if matches!(job.status.as_str(), "draft" | "waiting") { job.status = "cancelled".into(); }
    else { return Err("系统已接受或可能接受此任务，不能从应用撤回".into()); }
    save(&app, &current)?;
    drop(current);
    if let Some(window) = app.get_webview_window(&format!("print-{id}")) { let _ = window.destroy(); }
    changed(&app);
    Ok(())
}

#[tauri::command]
pub(crate) async fn desktop_print_reprint(app: AppHandle, window: WebviewWindow, id: String, settings: PrintSettings) -> Result<String, String> {
    main_only(&window)?;
    let (revision, token, mut job) = job_snapshot(&app, &id)?;
    if matches!(job.status.as_str(), "waiting" | "submitting") { return Err("任务尚在队列中，不可重复添加".into()); }
    if job.document.sn_batch.as_ref().is_some_and(|batch| batch.registration != "registered") { return Err("SN 登记结果尚未确认，不能重打".into()); }
    if (settings.paper.width_mm - job.settings.paper.width_mm).abs() > 0.2
        || (settings.paper.height_mm - job.settings.paper.height_mm).abs() > 0.2
        || settings.landscape != job.settings.landscape {
        return Err("重打保留原批次版式，请选择与原任务相同尺寸及方向的纸型；可更换打印机和份数".into());
    }
    authorize_job(&app, &token, &job).await?;
    native::validate(&settings, &desktop_print_printers(window).await?)?;
    let state = app.state::<DesktopPrintState>();
    let mut current = state.0.lock().map_err(|_| "打印状态不可用")?;
    if current.revision != revision { return Err("登录会话已变化".into()); }
    if current.saved.jobs.len() >= MAX_JOBS { return Err("请先删除旧的打印记录".into()); }
    if current.saved.jobs.iter().flat_map(|stored| &stored.document.pages).map(String::len).sum::<usize>()
        + job.document.pages.iter().map(String::len).sum::<usize>() > MAX_SAVED_HTML {
        return Err("打印快照存储已达 64 MB，请先删除旧记录".into());
    }
    current.next_id += 1;
    job.id = format!("{}-{}", now(), current.next_id);
    job.parent_id = Some(id);
    job.created_at = now();
    job.status = "draft".into();
    job.message.clear();
    job.settings = settings;
    job.ready = false;
    job.preview_revision = 0;
    job.render_error = None;
    job.preview_building = false;
    let id = job.id.clone();
    current.saved.preferences.insert(job.document.kind.clone(), job.settings.clone());
    current.saved.jobs.push(job);
    save(&app, &current)?;
    drop(current);
    changed(&app);
    Ok(id)
}
