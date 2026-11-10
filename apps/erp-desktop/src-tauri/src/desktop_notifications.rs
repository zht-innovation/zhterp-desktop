use std::{
    sync::Mutex,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use serde::{de::DeserializeOwned, Deserialize, Serialize};
use tauri::{AppHandle, Emitter, EventTarget, Manager};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Notify;

#[cfg(target_os = "windows")]
use crate::desktop_lifecycle::TRAY_ID;
use crate::{session::token_is_current, transport::Transport, MAIN_WINDOW};

const POLL_INTERVAL: Duration = Duration::from_secs(60);
const SUMMARY_EVENT: &str = "erp-notification-summary";

#[derive(Clone)]
struct Session {
    token: String,
    role: i64,
}

#[derive(Default)]
struct SessionState {
    revision: u64,
    session: Option<Session>,
    previous_total: Option<u32>,
}

#[derive(Default)]
struct DesktopNotifications {
    current: Mutex<SessionState>,
    wake: Notify,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct UnreadSummary {
    announcement_unread: u32,
    notification_unread: u32,
    total_unread: u32,
}

#[derive(Deserialize)]
struct ApiResponse<T> {
    code: u16,
    data: Option<T>,
}

#[derive(Deserialize)]
struct Profile {
    user: ProfileUser,
}

#[derive(Deserialize)]
struct ProfileUser {
    role: ProfileRole,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ProfileRole {
    Number(i64),
    Text(String),
}

impl ProfileRole {
    fn number(&self) -> Option<i64> {
        match self {
            Self::Number(value) => Some(*value),
            Self::Text(value) => value.trim().parse().ok(),
        }
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "kebab-case")]
enum UpdateStatus {
    Ready,
    Expired,
    Forbidden,
    ProfileChanged,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SummaryUpdate {
    revision: u64,
    started_at: u64,
    status: UpdateStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    summary: Option<UnreadSummary>,
}

enum PollFailure {
    Inactive(UpdateStatus),
    Unavailable,
}

fn response_data<T: DeserializeOwned>(
    response: Result<(u16, Vec<u8>), String>,
) -> Result<T, PollFailure> {
    let (status, body) = response.map_err(|_| PollFailure::Unavailable)?;
    match status {
        401 => return Err(PollFailure::Inactive(UpdateStatus::Expired)),
        403 => return Err(PollFailure::Inactive(UpdateStatus::Forbidden)),
        200 => {}
        _ => return Err(PollFailure::Unavailable),
    }

    let result: ApiResponse<T> =
        serde_json::from_slice(&body).map_err(|_| PollFailure::Unavailable)?;
    match result.code {
        401 => Err(PollFailure::Inactive(UpdateStatus::Expired)),
        403 => Err(PollFailure::Inactive(UpdateStatus::Forbidden)),
        200 => result.data.ok_or(PollFailure::Unavailable),
        _ => Err(PollFailure::Unavailable),
    }
}

async fn poll(app: &AppHandle, session: &Session) -> Result<UnreadSummary, PollFailure> {
    if !token_is_current(&session.token) {
        return Err(PollFailure::Inactive(UpdateStatus::Expired));
    }

    let transport = app.state::<Transport>();
    let summary = response_data(transport.notification_unread_summary(&session.token).await)?;
    let profile = transport.notification_profile(&session.token).await;
    if matches!(&profile, Ok((404, _))) {
        return Err(PollFailure::Inactive(UpdateStatus::Expired));
    }
    let profile: Profile = response_data(profile)?;
    if profile.user.role.number() != Some(session.role) {
        return Err(PollFailure::Inactive(UpdateStatus::ProfileChanged));
    }

    Ok(summary)
}

fn update_badge(app: &AppHandle, total: u32) {
    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let count = (total > 0).then_some(i64::from(total));
        let _ = window.set_badge_count(count);
    }

    #[cfg(target_os = "windows")]
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let app_name = app.config().product_name.as_deref().unwrap_or("ZH ERP");
        let tooltip = if total > 0 {
            format!("{app_name}（{total} 条未读）")
        } else {
            app_name.to_owned()
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn publish(
    app: &AppHandle,
    revision: u64,
    started_at: u64,
    result: Result<UnreadSummary, PollFailure>,
) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let notifications = handle.state::<DesktopNotifications>();
        let (status, summary, should_notify) = {
            let Ok(mut current) = notifications.current.lock() else {
                return;
            };
            if current.revision != revision {
                return;
            }
            let Some(session) = current.session.as_ref() else {
                return;
            };

            let result = if token_is_current(&session.token) {
                result
            } else {
                Err(PollFailure::Inactive(UpdateStatus::Expired))
            };
            match result {
                Ok(summary) => {
                    let previous = current.previous_total.replace(summary.total_unread);
                    let should_notify = previous.is_some_and(|count| summary.total_unread > count);
                    (UpdateStatus::Ready, Some(summary), should_notify)
                }
                Err(PollFailure::Inactive(status)) => {
                    current.session = None;
                    current.previous_total = None;
                    (status, None, false)
                }
                Err(PollFailure::Unavailable) => return,
            }
        };

        update_badge(&handle, summary.as_ref().map_or(0, |item| item.total_unread));
        if should_notify {
            let _ = handle
                .notification()
                .builder()
                .title(handle.config().product_name.as_deref().unwrap_or("ZH ERP"))
                .body("你有新的未读通知，请打开 ERP 查看。")
                .show();
        }

        let _ = handle.emit_to(
            EventTarget::webview_window(MAIN_WINDOW),
            SUMMARY_EVENT,
            SummaryUpdate { revision, started_at, status, summary },
        );
    });
}

pub(crate) fn start(app: &AppHandle) {
    app.manage(DesktopNotifications::default());
    let handle = app.clone();
    tauri::async_runtime::spawn(async move {
        let notifications = handle.state::<DesktopNotifications>();
        loop {
            let snapshot = {
                let Ok(current) = notifications.current.lock() else {
                    return;
                };
                current.session.clone().map(|session| (current.revision, session))
            };
            let Some((revision, session)) = snapshot else {
                notifications.wake.notified().await;
                continue;
            };
            let started_at = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map_or(0, |duration| duration.as_millis() as u64);
            let result = tokio::select! {
                biased;
                _ = notifications.wake.notified() => continue,
                result = poll(&handle, &session) => result,
            };
            publish(&handle, revision, started_at, result);
            tokio::select! {
                _ = notifications.wake.notified() => {},
                _ = tokio::time::sleep(POLL_INTERVAL) => {},
            }
        }
    });
}

#[tauri::command]
pub(crate) fn sync_desktop_notifications(
    app: AppHandle,
    token: Option<String>,
    role: Option<i64>,
    revision: u64,
) -> Result<(), String> {
    let handle = app.clone();
    app.run_on_main_thread(move || {
        let notifications = handle.state::<DesktopNotifications>();
        {
            let Ok(mut current) = notifications.current.lock() else {
                return;
            };
            if revision <= current.revision {
                return;
            }
            current.revision = revision;
            current.session = token.zip(role).map(|(token, role)| Session { token, role });
            current.previous_total = None;
        }

        update_badge(&handle, 0);
        notifications.wake.notify_one();
    })
    .map_err(|_| "无法更新桌面通知会话".to_owned())
}

#[tauri::command]
pub(crate) fn refresh_desktop_notifications(app: AppHandle) {
    app.state::<DesktopNotifications>().wake.notify_one();
}
