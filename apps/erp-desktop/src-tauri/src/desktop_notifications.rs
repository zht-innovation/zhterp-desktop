use std::{
    future::Future,
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
    sources: NotificationSources,
}

#[derive(Clone, Copy, Deserialize)]
pub(crate) struct NotificationSources {
    approval: bool,
    notification: bool,
}

#[derive(Clone, Copy, Default)]
struct SourceCounts {
    approval: Option<u32>,
    notification: Option<u32>,
}

#[derive(Default)]
struct SessionState {
    revision: u64,
    session: Option<Session>,
    counts: SourceCounts,
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
#[serde(rename_all = "camelCase")]
struct ApprovalSummary {
    pending_count: u32,
    unread_counts: ApprovalUnreadCounts,
}

#[derive(Deserialize)]
struct ApprovalUnreadCounts {
    processed: u32,
    mine: u32,
    cc: u32,
}

impl ApprovalSummary {
    fn total(&self) -> u32 {
        self.pending_count
            .saturating_add(self.unread_counts.processed)
            .saturating_add(self.unread_counts.mine)
            .saturating_add(self.unread_counts.cc)
    }
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
    NotificationForbidden,
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

enum SourceUpdate<T> {
    Ready(T),
    Forbidden,
    Unchanged,
}

impl<T> SourceUpdate<T> {
    fn keep_forbidden(self) -> Self {
        match self {
            Self::Forbidden => Self::Forbidden,
            _ => Self::Unchanged,
        }
    }

    fn update_count(&self, previous: &mut Option<u32>, total: impl FnOnce(&T) -> u32) -> bool {
        match self {
            Self::Ready(summary) => {
                let count = total(summary);
                previous.replace(count).is_some_and(|prior| count > prior)
            }
            Self::Forbidden => {
                *previous = None;
                false
            }
            Self::Unchanged => false,
        }
    }
}

struct PollUpdates {
    approval: SourceUpdate<ApprovalSummary>,
    notification: SourceUpdate<UnreadSummary>,
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

async fn poll_source<T: DeserializeOwned>(
    enabled: bool,
    request: impl Future<Output = Result<(u16, Vec<u8>), String>>,
) -> Result<SourceUpdate<T>, UpdateStatus> {
    if !enabled {
        return Ok(SourceUpdate::Unchanged);
    }

    match response_data(request.await) {
        Ok(summary) => Ok(SourceUpdate::Ready(summary)),
        Err(PollFailure::Inactive(UpdateStatus::Forbidden)) => Ok(SourceUpdate::Forbidden),
        Err(PollFailure::Inactive(status)) => Err(status),
        Err(PollFailure::Unavailable) => Ok(SourceUpdate::Unchanged),
    }
}

async fn poll(app: &AppHandle, session: &Session) -> Result<PollUpdates, UpdateStatus> {
    if !token_is_current(&session.token) {
        return Err(UpdateStatus::Expired);
    }

    let transport = app.state::<Transport>();
    let (approval, notification) = tokio::join!(
        poll_source(
            session.sources.approval,
            transport.approval_unread_summary(&session.token),
        ),
        poll_source(
            session.sources.notification,
            transport.notification_unread_summary(&session.token),
        ),
    );
    let approval = approval?;
    let notification = notification?;

    // Check the role once before displaying either source's counts.
    let profile = transport.notification_profile(&session.token).await;
    if matches!(&profile, Ok((404, _))) {
        return Err(UpdateStatus::Expired);
    }
    match response_data::<Profile>(profile) {
        Ok(profile) if profile.user.role.number() == Some(session.role) => {
            Ok(PollUpdates { approval, notification })
        }
        Ok(_) => Err(UpdateStatus::ProfileChanged),
        Err(PollFailure::Inactive(status)) => Err(status),
        Err(PollFailure::Unavailable) => Ok(PollUpdates {
            approval: approval.keep_forbidden(),
            notification: notification.keep_forbidden(),
        }),
    }
}

fn update_badge(app: &AppHandle, counts: SourceCounts) {
    let approval = counts.approval.unwrap_or(0);
    let notification = counts.notification.unwrap_or(0);

    #[cfg(target_os = "macos")]
    if let Some(window) = app.get_webview_window(MAIN_WINDOW) {
        let total = i64::from(approval) + i64::from(notification);
        let count = (total > 0).then_some(total);
        let _ = window.set_badge_count(count);
    }

    #[cfg(target_os = "windows")]
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let app_name = app.config().product_name.as_deref().unwrap_or("ZH ERP");
        let tooltip = if approval > 0 || notification > 0 {
            format!("{app_name}（审批 {approval} · 通知 {notification}）")
        } else {
            app_name.to_owned()
        };
        let _ = tray.set_tooltip(Some(tooltip));
    }
}

fn notification_message(
    approval_increased: bool,
    notification_increased: bool,
) -> Option<&'static str> {
    match (approval_increased, notification_increased) {
        (true, true) => Some("你有新的审批事项和未读通知，请打开 ERP 查看。"),
        (true, false) => Some("你有新的审批待办或未读消息，请打开 ERP 查看。"),
        (false, true) => Some("你有新的未读通知，请打开 ERP 查看。"),
        (false, false) => None,
    }
}

fn publish(
    app: &AppHandle,
    revision: u64,
    started_at: u64,
    result: Result<PollUpdates, UpdateStatus>,
) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let notifications = handle.state::<DesktopNotifications>();
        let (counts, update, message) = {
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
                Err(UpdateStatus::Expired)
            };
            match result {
                Ok(updates) => {
                    let approval_increased = updates
                        .approval
                        .update_count(&mut current.counts.approval, ApprovalSummary::total);
                    let notification_increased = updates
                        .notification
                        .update_count(&mut current.counts.notification, |summary| summary.total_unread);
                    let update = match updates.notification {
                        SourceUpdate::Ready(summary) => Some((UpdateStatus::Ready, Some(summary))),
                        SourceUpdate::Forbidden => Some((UpdateStatus::NotificationForbidden, None)),
                        SourceUpdate::Unchanged => None,
                    };
                    let message = notification_message(approval_increased, notification_increased);
                    (current.counts, update, message)
                }
                Err(status) => {
                    current.session = None;
                    current.counts = SourceCounts::default();
                    (current.counts, Some((status, None)), None)
                }
            }
        };

        update_badge(&handle, counts);
        if let Some(message) = message {
            let _ = handle
                .notification()
                .builder()
                .title(handle.config().product_name.as_deref().unwrap_or("ZH ERP"))
                .body(message)
                .show();
        }

        if let Some((status, summary)) = update {
            let _ = handle.emit_to(
                EventTarget::webview_window(MAIN_WINDOW),
                SUMMARY_EVENT,
                SummaryUpdate { revision, started_at, status, summary },
            );
        }
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
    sources: NotificationSources,
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
            current.session = if sources.approval || sources.notification {
                token.zip(role).map(|(token, role)| Session {
                    token,
                    role,
                    sources,
                })
            } else {
                None
            };
            current.counts = SourceCounts::default();
        }

        update_badge(&handle, SourceCounts::default());
        notifications.wake.notify_one();
    })
    .map_err(|_| "无法更新桌面通知会话".to_owned())
}

#[tauri::command]
pub(crate) fn refresh_desktop_notifications(app: AppHandle) {
    app.state::<DesktopNotifications>().wake.notify_one();
}
