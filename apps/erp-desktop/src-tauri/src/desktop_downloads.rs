use std::{
    collections::HashMap,
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
    sync::{atomic::{AtomicBool, AtomicU64, AtomicUsize, Ordering}, Arc, Mutex, MutexGuard},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Manager, State, WebviewWindow};
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{Notify, Semaphore};

use crate::transport::{decode_payload, Transport, ERP_ORIGIN, MAX_PAYLOAD_BYTES};

const HISTORY_LIMIT: usize = 200;
const ACTIVE_LIMIT: usize = 12;
const EVENT: &str = "erp-downloads-changed";
const CANCELLED: &str = "下载已取消";

#[derive(Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DownloadStatus { Waiting, Processing, AwaitingSave, Saved, Cancelled, Failed, Interrupted }

impl DownloadStatus {
    fn active(&self) -> bool {
        matches!(self, Self::Waiting | Self::Processing | Self::AwaitingSave)
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadTask {
    id: String,
    name: String,
    kind: String,
    status: DownloadStatus,
    created_at: u64,
    transferred: u64,
    total: Option<u64>,
    error: Option<String>,
    stage: Option<String>,
    #[serde(default)]
    can_retry: bool,
    source_page: Option<String>,
    path: Option<PathBuf>,
    #[serde(skip_serializing_if = "Option::is_none")]
    remote_path: Option<String>,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DownloadHistory {
    directory: Option<PathBuf>,
    tasks: Vec<DownloadTask>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadSnapshot {
    scope: String,
    directory: Option<PathBuf>,
    tasks: Vec<DownloadTask>,
    warning: Option<String>,
}

struct Cancellation { cancelled: AtomicBool, notify: Notify }

impl Cancellation {
    fn new() -> Self { Self { cancelled: AtomicBool::new(false), notify: Notify::new() } }
    fn cancel(&self) {
        self.cancelled.store(true, Ordering::SeqCst);
        self.notify.notify_one();
    }
    async fn wait(&self) {
        if !self.cancelled.load(Ordering::SeqCst) { self.notify.notified().await; }
    }
    fn check(&self) -> Result<(), String> {
        if self.cancelled.load(Ordering::SeqCst) { Err(CANCELLED.into()) } else { Ok(()) }
    }
}

#[derive(Default)]
struct DownloadMemory {
    scope: String,
    token_key: String,
    username: String,
    history: DownloadHistory,
    active: HashMap<String, Arc<Cancellation>>,
    warning: Option<String>,
}

pub(crate) struct DesktopDownloads {
    memory: Mutex<DownloadMemory>,
    account_revision: AtomicU64,
    next_id: AtomicU64,
    buffered_bytes: AtomicUsize,
    slots: Semaphore,
    dialogs: Semaphore,
}

impl Default for DesktopDownloads {
    fn default() -> Self {
        Self {
            memory: Mutex::new(DownloadMemory::default()),
            account_revision: AtomicU64::new(0),
            next_id: AtomicU64::new(0),
            buffered_bytes: AtomicUsize::new(0),
            slots: Semaphore::new(2),
            dialogs: Semaphore::new(1),
        }
    }
}

impl DesktopDownloads {
    pub(crate) fn reset(&self, app: &AppHandle) {
        self.account_revision.fetch_add(1, Ordering::SeqCst);
        let Ok(mut memory) = self.lock() else { return; };
        for control in memory.active.values() { control.cancel(); }
        for task in &mut memory.history.tasks {
            if task.status.active() { task.status = DownloadStatus::Interrupted; }
        }
        persist(app, &mut memory);
        *memory = DownloadMemory::default();
        emit(app, &memory);
    }

    fn lock(&self) -> Result<MutexGuard<'_, DownloadMemory>, String> {
        self.memory.lock().map_err(|_| "无法读取下载状态".to_owned())
    }

    fn scope(&self, token: &str) -> Result<String, String> {
        let memory = self.lock()?;
        if !crate::session::token_is_current(token) || memory.scope.is_empty() || memory.token_key != digest(token) {
            return Err("下载账号已变化，请重新打开下载中心".into());
        }
        Ok(memory.scope.clone())
    }

    fn update(&self, app: &AppHandle, scope: &str, id: &str, save: bool, change: impl FnOnce(&mut DownloadTask)) {
        let Ok(mut memory) = self.lock() else { return; };
        if memory.scope != scope || !memory.active.contains_key(id) { return; }
        if let Some(task) = memory.history.tasks.iter_mut().find(|task| task.id == id) {
            change(task);
        }
        if save { persist(app, &mut memory); }
        emit(app, &memory);
    }

    fn begin(&self, app: &AppHandle, token: &str, request: &DownloadRequest, remote: bool) -> Result<(String, Arc<Cancellation>), String> {
        validate_name(&request.name)?;
        if request.id.is_empty() || request.id.len() > 80
            || !request.id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'-') {
            return Err("下载任务编号无效".into());
        }
        let scope = self.scope(token)?;
        let mut memory = self.lock()?;
        if memory.scope != scope || memory.token_key != digest(token) || memory.active.len() >= ACTIVE_LIMIT {
            return Err("当前下载任务较多，请等待后重试".into());
        }
        if memory.history.tasks.iter().any(|task| task.id == request.id) {
            return Err("下载任务编号已使用，请重新创建下载".into());
        }
        while memory.history.tasks.len() >= HISTORY_LIMIT {
            let Some(index) = memory.history.tasks.iter().rposition(|task| !task.status.active()) else { break; };
            memory.history.tasks.remove(index);
        }
        memory.history.tasks.insert(0, DownloadTask {
            id: request.id.clone(), name: request.name.clone(),
            kind: if remote { "remote" } else { "local" }.into(),
            status: DownloadStatus::Waiting, created_at: now_millis(), transferred: 0, total: None,
            error: None, path: None, stage: None, can_retry: false,
            source_page: request.source_page.clone().filter(|path| valid_source_page(path)),
            remote_path: if remote { request.path.as_deref().and_then(retry_path) } else { None },
        });
        let cancellation = Arc::new(Cancellation::new());
        memory.active.insert(request.id.clone(), cancellation.clone());
        persist(app, &mut memory);
        emit(app, &memory);
        Ok((scope, cancellation))
    }

    fn finish(&self, app: &AppHandle, scope: &str, id: &str, result: &Result<Option<PathBuf>, String>) {
        let Ok(mut memory) = self.lock() else { return; };
        if memory.scope != scope || !memory.active.contains_key(id) { return; }
        memory.active.remove(id);
        if let Some(task) = memory.history.tasks.iter_mut().find(|task| task.id == id) {
            match result {
                Ok(Some(path)) => {
                    task.status = DownloadStatus::Saved;
                    task.path = Some(path.clone());
                    task.error = None;
                }
                Ok(None) => task.status = DownloadStatus::Cancelled,
                Err(error) if error == CANCELLED => task.status = DownloadStatus::Cancelled,
                Err(error) => { task.status = DownloadStatus::Failed; task.error = Some(error.clone()); }
            }
        }
        persist(app, &mut memory);
        emit(app, &memory);
    }
}

fn digest(value: &str) -> String { format!("{:x}", Sha256::digest(value.as_bytes())) }
fn now_millis() -> u64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis() as u64 }
fn valid_source_page(path: &str) -> bool {
    path.starts_with("/configuration/") && path.len() <= 240
        && !path.contains('?') && !path.contains('#') && !path.contains('\\')
        && !path.chars().any(char::is_control)
}
fn retry_path(path: &str) -> Option<String> {
    // Static attachments have no per-resource authorization endpoint. Their
    // source page must fetch the current business record before downloading again.
    if path.starts_with("/main/") { return None; }
    let url = tauri::Url::parse(ERP_ORIGIN).ok()?.join(path).ok()?;
    for (key, _) in url.query_pairs() {
        let key = key.to_ascii_lowercase();
        if key.contains("token") || key.contains("password") || key.contains("signature")
            || matches!(key.as_str(), "authorization" | "api_key" | "apikey" | "secret") {
            return None;
        }
    }
    Some(path.to_owned())
}
fn validate_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() || name.len() > 240
        || name.chars().any(|character| character.is_control() || matches!(character, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        || Path::new(name).file_name().and_then(|value| value.to_str()) != Some(name) {
        return Err("无效的保存文件名".into());
    }
    Ok(())
}
fn validate_saved_location(path: &Path) -> Result<(), String> {
    if !path.is_absolute()
        || path.to_str().is_none_or(|value| value.len() > 32_767 || value.chars().any(char::is_control))
        || path.components().any(|part| matches!(part, Component::ParentDir | Component::CurDir)) {
        return Err("下载文件位置无效，请回来源页面重新下载".into());
    }
    #[cfg(windows)]
    if let Some(Component::Prefix(prefix)) = path.components().next() {
        use std::path::Prefix;
        if !matches!(prefix.kind(), Prefix::Disk(_) | Prefix::UNC(_, _) | Prefix::VerbatimDisk(_) | Prefix::VerbatimUNC(_, _)) {
            return Err("下载文件位置无效，请回来源页面重新下载".into());
        }
    }
    let name = path.file_name().and_then(|value| value.to_str()).ok_or("下载文件名无效")?;
    validate_name(name)
}
fn validate_saved_path(path: &Path) -> Result<PathBuf, String> {
    validate_saved_location(path)?;
    // 历史记录不是可信的文件选择器结果；文件和父目录都不能通过符号链接跳转。
    for ancestor in path.ancestors() {
        let metadata = fs::symlink_metadata(ancestor).map_err(|_| "文件已被移动、删除或无法访问")?;
        if metadata.file_type().is_symlink() {
            return Err("下载文件位置包含符号链接，请回来源页面重新下载".into());
        }
        if ancestor == path {
            if !metadata.is_file() { return Err("下载位置不是普通文件".into()); }
        } else if !metadata.is_dir() {
            return Err("下载文件所在目录无效".into());
        }
    }
    path.canonicalize().map_err(|_| "无法确认下载文件位置".into())
}
fn can_open_file(path: &Path) -> bool {
    let extension = path.extension().and_then(|value| value.to_str()).unwrap_or("").to_ascii_lowercase();
    matches!(extension.as_str(),
        "pdf" | "txt" | "csv" | "xls" | "xlsx" | "doc" | "docx" | "ppt" | "pptx" | "rtf"
        | "odt" | "ods" | "odp" | "png" | "jpg" | "jpeg" | "gif" | "bmp" | "webp" | "tif" | "tiff")
}
fn main_window(window: &WebviewWindow) -> Result<(), String> {
    if window.label() != crate::MAIN_WINDOW { return Err("此窗口不能操作下载任务".into()); }
    Ok(())
}
fn history_path(app: &AppHandle, scope: &str) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(|_| "无法访问下载历史目录")?;
    Ok(root.join("downloads").join(format!("{scope}.json")))
}
fn persist(app: &AppHandle, memory: &mut DownloadMemory) {
    let result = (|| -> Result<(), String> {
        if memory.scope.is_empty() { return Ok(()); }
        let path = history_path(app, &memory.scope)?;
        let parent = path.parent().ok_or("下载历史目录无效")?;
        fs::create_dir_all(parent).map_err(|_| "无法创建下载历史目录")?;
        let bytes = serde_json::to_vec(&memory.history).map_err(|_| "无法整理下载历史")?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法保存下载历史")?;
        temporary.write_all(&bytes).and_then(|_| temporary.as_file().sync_all()).map_err(|_| "无法保存下载历史")?;
        temporary.persist(path).map_err(|_| "无法保存下载历史")?;
        Ok(())
    })();
    memory.warning = result.err();
}
fn snapshot(memory: &DownloadMemory) -> DownloadSnapshot {
    let mut tasks = memory.history.tasks.clone();
    for task in &mut tasks {
        task.can_retry = task.kind == "remote" && task.remote_path.as_deref().and_then(retry_path).is_some();
        task.remote_path = None;
    }
    DownloadSnapshot { scope: memory.scope.clone(), directory: memory.history.directory.clone(), tasks, warning: memory.warning.clone() }
}
fn emit(app: &AppHandle, memory: &DownloadMemory) { let _ = app.emit_to(crate::MAIN_WINDOW, EVENT, snapshot(memory)); }

async fn username_for_token(app: &AppHandle, token: &str) -> Result<String, String> {
    if !crate::session::token_is_current(token) { return Err("请先登录后再操作下载任务".into()); }
    let transport = app.state::<Transport>();
    let (status, bytes) = transport.notification_profile(token).await?;
    if status != 200 { return Err("登录已失效或当前账号不可用，请重新登录".into()); }
    let profile: serde_json::Value = serde_json::from_slice(&bytes).map_err(|_| "无法核对当前下载账号")?;
    if profile.get("code").and_then(|value| value.as_u64()) != Some(200) { return Err("无法核对当前下载账号".into()); }
    let username = profile.pointer("/data/user/username").and_then(|value| value.as_str()).unwrap_or("");
    if username.is_empty() { return Err("无法核对当前下载账号".into()); }
    Ok(username.to_owned())
}

#[tauri::command]
pub(crate) async fn sync_download_account(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: Option<String>) -> Result<DownloadSnapshot, String> {
    main_window(&window)?;
    let revision = state.account_revision.fetch_add(1, Ordering::SeqCst) + 1;
    let token = token.unwrap_or_default();
    let token_key = digest(&token);
    {
        let mut memory = state.lock()?;
        if crate::session::token_is_current(&token) && memory.token_key == token_key { return Ok(snapshot(&memory)); }
        for control in memory.active.values() { control.cancel(); }
        for task in &mut memory.history.tasks {
            if task.status.active() { task.status = DownloadStatus::Cancelled; }
        }
        persist(window.app_handle(), &mut memory);
        *memory = DownloadMemory::default();
        emit(window.app_handle(), &memory);
    }
    if token.is_empty() { return Ok(snapshot(&*state.lock()?)); }
    let username = username_for_token(window.app_handle(), &token).await?;
    let scope = digest(&format!("{}\n{}\n{username}", window.app_handle().config().identifier, ERP_ORIGIN));
    let path = history_path(window.app_handle(), &scope)?;
    let mut history = DownloadHistory::default();
    let mut warning = None;
    if path.exists() {
        match fs::metadata(&path).ok().filter(|value| value.len() <= 1024 * 1024)
            .and_then(|_| fs::read(&path).ok()).and_then(|bytes| serde_json::from_slice::<DownloadHistory>(&bytes).ok()) {
            Some(saved) => history = saved,
            None => warning = Some("下载历史无法读取，当前显示新的任务记录".into()),
        }
    }
    history.tasks.truncate(HISTORY_LIMIT);
    let previous_count = history.tasks.len();
    history.tasks.retain(|task| validate_name(&task.name).is_ok());
    if history.tasks.len() != previous_count {
        warning = Some("部分下载历史的文件名无效，已跳过这些记录".into());
    }
    for task in &mut history.tasks {
        if task.status.active() { task.status = DownloadStatus::Interrupted; }
        if task.status == DownloadStatus::Saved {
            let location = task.path.as_deref().ok_or_else(|| "下载历史缺少文件位置".to_owned());
            if let Err(error) = location.and_then(validate_saved_location) {
                task.path = None;
                task.status = DownloadStatus::Failed;
                task.error = Some(error);
                warning = Some("部分下载历史的文件位置无效，请回来源页面重新下载".into());
                continue;
            }
            match validate_saved_path(task.path.as_deref().ok_or("下载历史缺少文件位置")?) {
                Ok(path) => { task.path = Some(path); task.error = None; }
                Err(error) => {
                    // 可移动磁盘或网络目录可能暂时离线，保留记录以便恢复后重试打开。
                    task.error = Some(error);
                    warning = Some("部分已保存文件暂时无法访问，打开或定位时将重新检查文件位置".into());
                }
            }
        } else {
            task.path = None;
        }
    }
    let mut memory = state.lock()?;
    if state.account_revision.load(Ordering::SeqCst) != revision { return Err("下载账号已变化".into()); }
    *memory = DownloadMemory { scope, token_key, username, history, warning, active: HashMap::new() };
    emit(window.app_handle(), &memory);
    Ok(snapshot(&memory))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DownloadRequest {
    id: String,
    name: String,
    path: Option<String>,
    source_page: Option<String>,
}

struct Destination { path: PathBuf, previous: Option<(u64, SystemTime)> }
fn file_stamp(path: &Path) -> Result<Option<(u64, SystemTime)>, String> {
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.is_file() && !metadata.file_type().is_symlink() =>
            Ok(Some((metadata.len(), metadata.modified().map_err(|_| "无法检查目标文件")?))),
        Ok(_) => Err("目标位置不是普通文件，请重新另存为".into()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(_) => Err("无法检查保存位置".into()),
    }
}

async fn destination(window: &WebviewWindow, state: &DesktopDownloads, scope: &str, request: &DownloadRequest, control: &Cancellation) -> Result<Option<Destination>, String> {
    let _dialog = tokio::select! {
        _ = control.wait() => return Err(CANCELLED.into()),
        result = state.dialogs.acquire() => result.map_err(|_| "保存对话框不可用")?,
    };
    control.check()?;
    let directory = {
        let memory = state.lock()?;
        if memory.scope != scope { return Err(CANCELLED.into()); }
        memory.history.directory.clone()
    };
    if directory.as_ref().is_some_and(|path| !path.is_dir()) { return Err("默认下载目录已失效，请在下载中心重新选择目录".into()); }
    state.update(window.app_handle(), scope, &request.id, true, |task| task.status = DownloadStatus::AwaitingSave);
    let dialog_window = window.clone();
    let name = request.name.clone();
    let selected = tauri::async_runtime::spawn_blocking(move || {
        let mut picker = dialog_window.dialog().file().set_parent(&dialog_window).set_title("保存下载文件").set_file_name(name);
        if let Some(directory) = directory { picker = picker.set_directory(directory); }
        picker.blocking_save_file()
    }).await.map_err(|_| "无法打开保存对话框")?;
    control.check()?;
    let Some(selected) = selected else { return Ok(None); };
    let selected = selected.into_path().map_err(|_| "无法访问保存位置")?;
    let parent = selected.parent().ok_or("保存位置无效")?.canonicalize().map_err(|_| "无法访问保存目录")?;
    let path = parent.join(selected.file_name().ok_or("保存文件名无效")?);
    validate_saved_location(&path)?;
    let previous = file_stamp(&path)?;
    Ok(Some(Destination { path, previous }))
}

fn commit_file(temporary: tempfile::NamedTempFile, target: &Destination) -> Result<PathBuf, String> {
    if file_stamp(&target.path)? != target.previous { return Err("目标文件已变化，请重新另存为".into()); }
    temporary.as_file().sync_all().map_err(|_| "无法完成文件写入")?;
    if target.previous.is_some() {
        temporary.persist(&target.path).map_err(|_| "无法覆盖所选文件，请重新另存为")?;
    } else {
        temporary.persist_noclobber(&target.path).map_err(|_| "目标文件已存在或无法写入，请重新另存为")?;
    }
    Ok(target.path.clone())
}

async fn run_download(window: &WebviewWindow, state: &DesktopDownloads, token: &str, request: &DownloadRequest, body: Option<&str>) -> Result<bool, String> {
    main_window(window)?;
    let username = username_for_token(window.app_handle(), token).await?;
    if state.lock()?.username != username { return Err("下载账号已变化".into()); }
    if body.is_none() && request.path.as_ref().is_none_or(|path| path.len() > 4096) { return Err("下载地址无效".into()); }
    let existing = if body.is_some() {
        let scope = state.scope(token)?;
        let mut memory = state.lock()?;
        if memory.scope != scope || memory.token_key != digest(token) { return Err(CANCELLED.into()); }
        let control = memory.active.get(&request.id).cloned();
        let task = memory.history.tasks.iter_mut().find(|task| task.id == request.id);
        match (task, control) {
            (Some(task), Some(control)) if task.kind == "local" && task.name == request.name && task.stage.as_deref() == Some("generating") => {
                task.stage = Some("queued".into());
                task.status = DownloadStatus::Waiting;
                persist(window.app_handle(), &mut memory);
                emit(window.app_handle(), &memory);
                Some((scope, control))
            }
            _ => return Err("此本地导出任务已经结束，请重新导出".into()),
        }
    } else { None };
    let (scope, control) = match existing {
        Some(active) => active,
        None => state.begin(window.app_handle(), token, request, body.is_none())?,
    };
    let result = async {
        let _slot = tokio::select! {
            _ = control.wait() => return Err(CANCELLED.into()),
            result = state.slots.acquire() => result.map_err(|_| "下载队列不可用")?,
        };
        let Some(target) = destination(window, state, &scope, request, &control).await? else { return Ok(None); };
        control.check()?;
        let parent = target.path.parent().ok_or("保存位置无效")?;
        let mut temporary = tempfile::NamedTempFile::new_in(parent).map_err(|_| "无法在所选目录创建文件")?;
        state.update(window.app_handle(), &scope, &request.id, true, |task| {
            task.status = DownloadStatus::Processing;
            task.stage = Some(if body.is_some() { "saving" } else { "downloading" }.into());
        });
        if let Some(body) = body {
            let bytes = decode_payload(body)?;
            state.update(window.app_handle(), &scope, &request.id, false, |task| task.total = Some(bytes.len() as u64));
            for chunk in bytes.chunks(64 * 1024) {
                control.check()?;
                temporary.write_all(chunk).map_err(|_| "保存文件失败，请检查磁盘空间和写入权限")?;
                tokio::task::yield_now().await;
            }
            state.update(window.app_handle(), &scope, &request.id, false, |task| task.transferred = bytes.len() as u64);
        } else {
            let transport = window.app_handle().state::<Transport>();
            let mut response = tokio::select! {
                _ = control.wait() => return Err(CANCELLED.into()),
                response = transport.start_download(request.path.as_deref().unwrap_or_default(), token) => response?,
            };
            let total = response.content_length();
            state.update(window.app_handle(), &scope, &request.id, false, |task| task.total = total);
            let mut transferred = 0_u64;
            let mut last_progress = Instant::now();
            loop {
                let chunk = tokio::select! {
                    _ = control.wait() => return Err(CANCELLED.into()),
                    chunk = response.chunk() => chunk.map_err(|_| "下载中断，请检查网络后重试")?,
                };
                let Some(chunk) = chunk else { break; };
                if chunk.len() as u64 > MAX_PAYLOAD_BYTES as u64 - transferred { return Err("响应超过桌面客户端大小限制".into()); }
                temporary.write_all(&chunk).map_err(|_| "保存文件失败，请检查磁盘空间和写入权限")?;
                transferred += chunk.len() as u64;
                if last_progress.elapsed().as_millis() >= 200 {
                    state.update(window.app_handle(), &scope, &request.id, false, |task| task.transferred = transferred);
                    last_progress = Instant::now();
                }
            }
            if total.is_some_and(|total| total != transferred) { return Err("文件下载不完整，请重新下载".into()); }
            state.update(window.app_handle(), &scope, &request.id, false, |task| task.transferred = transferred);
        }
        control.check()?;
        // 与账号切换共用同一把锁，切换完成后不能再提交旧账号的文件。
        let mut memory = state.lock()?;
        if memory.scope != scope || memory.token_key != digest(token) { return Err(CANCELLED.into()); }
        control.check()?;
        let path = commit_file(temporary, &target)?;
        memory.active.remove(&request.id);
        if let Some(task) = memory.history.tasks.iter_mut().find(|task| task.id == request.id) {
            task.status = DownloadStatus::Saved;
            task.path = Some(path.clone());
            task.error = None;
        }
        persist(window.app_handle(), &mut memory);
        emit(window.app_handle(), &memory);
        drop(memory);
        Ok(Some(path))
    }.await;
    state.finish(window.app_handle(), &scope, &request.id, &result);
    match result {
        Ok(path) => Ok(path.is_some()),
        Err(error) if error == CANCELLED => Ok(false),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub(crate) async fn prepare_local_download(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, request: DownloadRequest) -> Result<(), String> {
    main_window(&window)?;
    let username = username_for_token(window.app_handle(), &token).await?;
    if state.lock()?.username != username { return Err("下载账号已变化".into()); }
    let (scope, _) = state.begin(window.app_handle(), &token, &request, false)?;
    state.update(window.app_handle(), &scope, &request.id, true, |task| {
        task.status = DownloadStatus::Processing;
        task.stage = Some("generating".into());
    });
    Ok(())
}

#[tauri::command]
pub(crate) fn fail_local_download(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, id: String) -> Result<(), String> {
    main_window(&window)?;
    let scope = {
        let memory = state.lock()?;
        // A preparation failure must be recorded even if this same session has
        // expired meanwhile. This only ends its existing task; it accesses no file.
        if memory.scope.is_empty() || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
        let task = memory.history.tasks.iter().find(|task| task.id == id).ok_or("下载任务不存在")?;
        if task.kind != "local" || task.stage.as_deref() != Some("generating") { return Ok(()); }
        memory.scope.clone()
    };
    state.finish(window.app_handle(), &scope, &id, &Err("文件生成或准备保存失败，请重试或回来源页面重新导出".into()));
    Ok(())
}

#[tauri::command]
pub(crate) async fn download_remote_file(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, request: DownloadRequest) -> Result<bool, String> {
    run_download(&window, &state, &token, &request, None).await
}

#[tauri::command]
pub(crate) async fn save_download_file(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, request: DownloadRequest, body: String) -> Result<bool, String> {
    let maximum = MAX_PAYLOAD_BYTES.div_ceil(3) * 4;
    if body.len() > maximum { return Err("数据超过桌面客户端大小限制".into()); }
    let mut previous = state.buffered_bytes.load(Ordering::SeqCst);
    loop {
        if body.len() > maximum.saturating_sub(previous) { return Err("本地导出正在处理中，请完成后重试".into()); }
        match state.buffered_bytes.compare_exchange(previous, previous + body.len(), Ordering::SeqCst, Ordering::SeqCst) {
            Ok(_) => break,
            Err(current) => previous = current,
        }
    }
    let _reservation = BufferReservation { counter: &state.buffered_bytes, bytes: body.len() };
    run_download(&window, &state, &token, &request, Some(&body)).await
}

struct BufferReservation<'a> { counter: &'a AtomicUsize, bytes: usize }
impl Drop for BufferReservation<'_> {
    fn drop(&mut self) { self.counter.fetch_sub(self.bytes, Ordering::SeqCst); }
}

#[tauri::command]
pub(crate) async fn retry_download_task(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, id: String) -> Result<bool, String> {
    main_window(&window)?;
    let scope = state.scope(&token)?;
    let request = {
        let memory = state.lock()?;
        if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
        let task = memory.history.tasks.iter().find(|task| task.id == id).ok_or("下载任务不存在")?;
        if task.kind != "remote" || task.status == DownloadStatus::Saved || task.status.active() { return Err("请回到来源页面重新导出此文件".into()); }
        let path = task.remote_path.as_deref().and_then(retry_path)
            .ok_or("此附件需要回来源页面重新取得当前可见记录后下载")?;
        DownloadRequest {
            id: format!("retry-{}-{}", now_millis(), state.next_id.fetch_add(1, Ordering::SeqCst)),
            name: task.name.clone(), path: Some(path), source_page: task.source_page.clone(),
        }
    };
    run_download(&window, &state, &token, &request, None).await
}

#[tauri::command]
pub(crate) fn cancel_download_task(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, id: String) -> Result<(), String> {
    main_window(&window)?;
    let scope = state.scope(&token)?;
    let memory = state.lock()?;
    if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
    let control = memory.active.get(&id).ok_or("下载任务已结束")?;
    control.cancel();
    drop(memory);
    state.finish(window.app_handle(), &scope, &id, &Err(CANCELLED.into()));
    Ok(())
}

#[tauri::command]
pub(crate) fn open_download_task(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, id: String, reveal: bool) -> Result<(), String> {
    main_window(&window)?;
    let scope = state.scope(&token)?;
    let memory = state.lock()?;
    if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
    let task = memory.history.tasks.iter().find(|task| task.id == id && task.status == DownloadStatus::Saved).ok_or("已保存任务不存在")?;
    let path = validate_saved_path(task.path.as_deref().ok_or("文件位置不存在")?)?;
    if reveal {
        tauri_plugin_opener::reveal_item_in_dir(&path).map_err(|_| "无法打开文件所在目录")?;
    } else {
        // 使用实际保存文件的后缀，不能信任下载名称或历史记录中的展示名称。
        if !can_open_file(&path) {
            return Err("此文件类型不支持在下载中心直接打开，请使用“定位目录”后自行确认文件".into());
        }
        tauri_plugin_opener::open_path(path.to_string_lossy(), None::<&str>).map_err(|_| "无法使用系统程序打开文件")?;
    }
    Ok(())
}

#[tauri::command]
pub(crate) fn clear_download_history(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String) -> Result<DownloadSnapshot, String> {
    main_window(&window)?;
    let scope = state.scope(&token)?;
    let mut memory = state.lock()?;
    if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
    memory.history.tasks.retain(|task| task.status.active());
    persist(window.app_handle(), &mut memory);
    emit(window.app_handle(), &memory);
    Ok(snapshot(&memory))
}

#[tauri::command]
pub(crate) async fn set_download_directory(window: WebviewWindow, state: State<'_, DesktopDownloads>, token: String, reset: bool) -> Result<DownloadSnapshot, String> {
    main_window(&window)?;
    let scope = state.scope(&token)?;
    let directory = if reset { None } else {
        let _dialog = state.dialogs.acquire().await.map_err(|_| "目录选择器不可用")?;
        if state.scope(&token)? != scope { return Err("下载账号已变化".into()); }
        let dialog_window = window.clone();
        let selected = tauri::async_runtime::spawn_blocking(move ||
            dialog_window.dialog().file().set_parent(&dialog_window).set_title("选择默认下载目录").blocking_pick_folder()
        ).await.map_err(|_| "无法打开目录选择器")?;
        let Some(selected) = selected else {
            let memory = state.lock()?;
            if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
            return Ok(snapshot(&memory));
        };
        let directory = selected.into_path().map_err(|_| "无法访问所选目录")?.canonicalize().map_err(|_| "无法访问所选目录")?;
        if !directory.is_dir() { return Err("所选位置不是文件夹".into()); }
        Some(directory)
    };
    let mut memory = state.lock()?;
    if memory.scope != scope || memory.token_key != digest(&token) { return Err("下载账号已变化".into()); }
    memory.history.directory = directory;
    persist(window.app_handle(), &mut memory);
    emit(window.app_handle(), &memory);
    Ok(snapshot(&memory))
}
