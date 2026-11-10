use std::{
    fs::{self, OpenOptions},
    io::ErrorKind,
    path::{Path, PathBuf},
    sync::{Mutex, MutexGuard},
    time::{SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use keyring::{Entry, Error::NoEntry};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};

use crate::transport::ERP_ORIGIN;

const SESSION_ERROR: &str = "无法访问系统凭据库";
const RESTORE_BLOCK_ERROR: &str = "无法更新桌面登录恢复状态";
const SESSION_MAX_AGE_SECS: u64 = 7 * 24 * 60 * 60;
static SESSION_LOCK: Mutex<()> = Mutex::new(());

#[derive(Deserialize)]
struct TokenExpiry {
    exp: u64,
}

#[derive(Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct SavedSession {
    token: String,
    expires_at: u64,
}

fn token_expiry(token: &str) -> Option<u64> {
    let mut parts = token.split('.');
    let (Some(header), Some(payload), Some(signature), None) =
        (parts.next(), parts.next(), parts.next(), parts.next())
    else {
        return None;
    };
    if header.is_empty() || signature.is_empty() || token.len() > 8192 {
        return None;
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload).ok()?;
    serde_json::from_slice::<TokenExpiry>(&bytes).ok().map(|value| value.exp)
}

fn now_seconds() -> Option<u64> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .ok()
        .map(|now| now.as_secs())
}

pub(crate) fn token_is_current(token: &str) -> bool {
    token_expiry(token)
        .zip(now_seconds())
        .is_some_and(|(expiry, now)| expiry > now)
}

fn restorable_token(saved: &str) -> Option<String> {
    let session = serde_json::from_str::<SavedSession>(saved).ok()?;
    let now = now_seconds()?;
    let max_expiry = token_expiry(&session.token)?.min(now + SESSION_MAX_AGE_SECS);
    if session.expires_at <= now || session.expires_at > max_expiry {
        return None;
    }
    Some(session.token)
}

fn lock_session() -> Result<MutexGuard<'static, ()>, String> {
    SESSION_LOCK.lock().map_err(|_| SESSION_ERROR.to_owned())
}

fn marker_path(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app.path().app_local_data_dir().map_err(|_| RESTORE_BLOCK_ERROR.to_owned())?;
    let origin_id = URL_SAFE_NO_PAD.encode(Sha256::digest(ERP_ORIGIN.as_bytes()));
    Ok(root.join("session-state").join(format!("{origin_id}.blocked")))
}

fn block_restore(marker: &Path) -> Result<(), String> {
    let parent = marker.parent().ok_or_else(|| RESTORE_BLOCK_ERROR.to_owned())?;
    fs::create_dir_all(parent).map_err(|_| RESTORE_BLOCK_ERROR.to_owned())?;
    match OpenOptions::new().write(true).create_new(true).open(marker) {
        Ok(_) => Ok(()),
        Err(error) if error.kind() == ErrorKind::AlreadyExists => Ok(()),
        Err(_) => Err(RESTORE_BLOCK_ERROR.into()),
    }
}

fn restore_is_allowed(marker: &Path) -> bool {
    matches!(fs::symlink_metadata(marker), Err(error) if error.kind() == ErrorKind::NotFound)
}

fn entry(app: &AppHandle) -> Result<Entry, String> {
    if !cfg!(any(target_os = "windows", target_os = "macos")) {
        return Err("当前平台没有可用的系统凭据库".into());
    }
    Entry::new(&app.config().identifier, ERP_ORIGIN).map_err(|_| SESSION_ERROR.to_owned())
}

fn remove_entry(entry: &Entry) -> Result<(), String> {
    match entry.delete_credential() {
        Ok(()) | Err(NoEntry) => Ok(()),
        Err(_) => Err(SESSION_ERROR.into()),
    }
}

#[tauri::command]
pub(crate) async fn restore_desktop_session(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = lock_session()?;
        let Ok(marker) = marker_path(&app) else {
            return Ok(None);
        };
        if !restore_is_allowed(&marker) {
            return Ok(None);
        }
        let entry = entry(&app)?;
        match entry.get_password() {
            Ok(saved) if restore_is_allowed(&marker) => Ok(restorable_token(&saved)),
            Ok(_) | Err(NoEntry) => Ok(None),
            Err(_) => Err(SESSION_ERROR.into()),
        }
    })
    .await
    .map_err(|_| SESSION_ERROR.to_owned())?
}

#[tauri::command]
pub(crate) async fn save_desktop_session(app: AppHandle, token: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = lock_session()?;
        let marker = marker_path(&app).and_then(|marker| {
            block_restore(&marker)?;
            Ok(marker)
        });
        let marker = match marker {
            Ok(marker) => marker,
            Err(error) => {
                let _ = entry(&app).and_then(|entry| remove_entry(&entry));
                return Err(error);
            }
        };
        let now = now_seconds().ok_or_else(|| "无法确定登录有效期".to_owned())?;
        let expiry = token_expiry(&token).filter(|&expiry| expiry > now)
            .ok_or_else(|| "登录会话无效或已过期".to_owned())?;
        let saved = SavedSession { token, expires_at: expiry.min(now + SESSION_MAX_AGE_SECS) };
        let saved = serde_json::to_string(&saved).map_err(|_| SESSION_ERROR.to_owned())?;
        entry(&app)?.set_password(&saved).map_err(|_| SESSION_ERROR.to_owned())?;
        fs::remove_file(marker).map_err(|_| RESTORE_BLOCK_ERROR.to_owned())
    })
    .await
    .map_err(|_| SESSION_ERROR.to_owned())?
}

#[tauri::command]
pub(crate) async fn clear_desktop_session(app: AppHandle) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _lock = lock_session()?;
        let blocked = marker_path(&app).and_then(|marker| block_restore(&marker));
        match entry(&app).and_then(|entry| remove_entry(&entry)) {
            Ok(()) => Ok(()),
            Err(error) if blocked.is_ok() => Err(error),
            Err(_) => Err("无法注销系统凭据或阻止下次恢复登录".into()),
        }
    })
    .await
    .map_err(|_| SESSION_ERROR.to_owned())?
}
