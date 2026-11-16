use std::time::Duration;

use serde::Serialize;
use tauri::{ipc::Channel, utils::config::Config, AppHandle, Manager, Url};
use tauri_plugin_updater::{Error, Update, UpdaterExt};
use tokio::sync::Mutex;
use updater_http::redirect::{Action, Attempt, Policy};

use crate::transport::ERP_ORIGIN;

pub(crate) const STAGING_IDENTIFIER: &str = "com.zhtaero.erp.staging";
const STAGING_ORIGIN: &str = "https://deploy.zhtaero.com";
const UPDATE_ENDPOINT: &str =
    "https://raw.githubusercontent.com/zht-innovation/zhterp-desktop/desktop-preview-feed/latest.json";
const RELEASE_ASSET_PREFIX: &str =
    "https://github.com/zht-innovation/zhterp-desktop/releases/download/desktop-preview-v";
const RELEASE_ASSET_HOST: &str = "release-assets.githubusercontent.com";
const UPDATE_FILENAME: &str = if cfg!(target_os = "windows") {
    "zh-erp-windows-x64-setup.exe"
} else {
    "zh-erp-macos-universal.app.tar.gz"
};
const PROGRESS_INTERVAL_BYTES: u64 = 1024 * 1024;
const DISABLED: &str = "此桌面版本未启用在线更新。";
const BUSY: &str = "正在检查或安装更新，请稍候。";

#[derive(Default)]
pub(crate) struct DesktopUpdates(Mutex<Option<Update>>);

#[derive(Serialize)]
pub(crate) struct AvailableUpdate {
    version: String,
    notes: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateProgress {
    stage: &'static str,
    downloaded_bytes: u64,
    total_bytes: Option<u64>,
}

pub(crate) fn is_enabled(config: &Config) -> bool {
    if cfg!(debug_assertions)
        || !cfg!(any(target_os = "windows", target_os = "macos"))
        || config.identifier != STAGING_IDENTIFIER
        || ERP_ORIGIN != STAGING_ORIGIN
    {
        return false;
    }

    let Some(settings) = config.plugins.0.get("updater") else {
        return false;
    };
    let Ok(settings) = serde_json::from_value::<tauri_plugin_updater::Config>(settings.clone()) else {
        return false;
    };
    matches!(settings.endpoints.as_slice(), [url] if url.as_str() == UPDATE_ENDPOINT)
        && !settings.pubkey.trim().is_empty()
        && settings.require_signed_version
        && !settings.allow_downgrades
        && !settings.dangerous_insecure_transport_protocol
        && !settings.dangerous_accept_invalid_certs
        && !settings.dangerous_accept_invalid_hostnames
}

#[tauri::command]
pub(crate) async fn check_desktop_update(
    app: AppHandle,
) -> Result<Option<AvailableUpdate>, &'static str> {
    let state = app.try_state::<DesktopUpdates>().ok_or(DISABLED)?;
    let mut pending = state.0.try_lock().map_err(|_| BUSY)?;
    *pending = None;

    let updater = app
        .updater_builder()
        .timeout(Duration::from_secs(15))
        .configure_client(|client| {
            client
                .https_only(true)
                .redirect(Policy::custom(github_release_redirect))
                .connect_timeout(Duration::from_secs(5))
                .read_timeout(Duration::from_secs(30))
        })
        .build()
        .map_err(check_error)?;
    let Some(mut update) = updater.check().await.map_err(check_error)? else {
        return Ok(None);
    };
    if update.raw_json.get("paused").and_then(|value| value.as_bool()) == Some(true) {
        return Ok(None);
    }

    let expected_url = format!("{RELEASE_ASSET_PREFIX}{}/{UPDATE_FILENAME}", update.version);
    if !is_release_version(&update.version) || update.download_url.as_str() != expected_url {
        return Err("更新包地址不正确，请联系管理员。");
    }

    update.timeout = Some(Duration::from_secs(600));
    let available = AvailableUpdate {
        version: update.version.clone(),
        notes: update.body.clone(),
    };
    *pending = Some(update);
    Ok(Some(available))
}

fn github_release_redirect(attempt: Attempt<'_>) -> Action {
    let destination = attempt.url();
    let allowed_source = matches!(attempt.previous(), [source] if is_release_asset_url(source));
    if allowed_source
        && destination.scheme() == "https"
        && destination.host_str() == Some(RELEASE_ASSET_HOST)
        && destination.port().is_none()
        && destination.username().is_empty()
        && destination.password().is_none()
        && destination.fragment().is_none()
    {
        return attempt.follow();
    }
    attempt.error("unexpected desktop update redirect")
}

fn is_release_asset_url(url: &Url) -> bool {
    let Some((version, filename)) = url
        .as_str()
        .strip_prefix(RELEASE_ASSET_PREFIX)
        .and_then(|path| path.split_once('/'))
    else {
        return false;
    };
    filename == UPDATE_FILENAME && is_release_version(version)
}

fn is_release_version(version: &str) -> bool {
    let mut parts = version.split('.');
    for _ in 0..3 {
        let Some(part) = parts.next() else {
            return false;
        };
        if part.is_empty()
            || (part.len() > 1 && part.starts_with('0'))
            || !part.bytes().all(|digit| digit.is_ascii_digit())
        {
            return false;
        }
    }
    parts.next().is_none()
}

#[tauri::command]
pub(crate) async fn install_desktop_update(
    app: AppHandle,
    version: String,
    on_progress: Channel<UpdateProgress>,
) -> Result<(), &'static str> {
    let state = app.try_state::<DesktopUpdates>().ok_or(DISABLED)?;
    let mut pending = state.0.try_lock().map_err(|_| BUSY)?;
    let update = pending
        .take()
        .filter(|update| update.version == version)
        .ok_or("请重新检查更新后再安装。")?;

    let mut downloaded_bytes = 0;
    let mut next_progress = 0;
    let bytes = update
        .download(
            |chunk_bytes, total_bytes| {
                downloaded_bytes += chunk_bytes as u64;
                if downloaded_bytes >= next_progress {
                    next_progress = downloaded_bytes + PROGRESS_INTERVAL_BYTES;
                    let _ = on_progress.send(UpdateProgress {
                        stage: "downloading",
                        downloaded_bytes,
                        total_bytes,
                    });
                }
            },
            || {},
        )
        .await
        .map_err(download_error)?;

    let _ = on_progress.send(UpdateProgress {
        stage: "installing",
        downloaded_bytes,
        total_bytes: Some(downloaded_bytes),
    });
    update.install(bytes).map_err(|error| {
        eprintln!("ERP desktop update installation failed: {error}");
        "无法安装更新，请重新检查更新或联系管理员。"
    })?;

    #[cfg(target_os = "macos")]
    app.request_restart();
    Ok(())
}

fn check_error(error: Error) -> &'static str {
    log_network_error("check", error);
    "无法检查更新，请检查网络后重试。"
}

fn download_error(error: Error) -> &'static str {
    let message = match &error {
        Error::Minisign(_)
        | Error::Base64(_)
        | Error::SignatureUtf8(_)
        | Error::SignedVersionMismatch { .. }
        | Error::MissingSignedVersion => "更新包签名校验失败，请联系管理员。",
        _ => "更新下载失败，请检查网络并重新检查更新。",
    };
    log_network_error("download", error);
    message
}

fn log_network_error(operation: &str, error: Error) {
    match error {
        Error::Reqwest(error) => {
            eprintln!("ERP desktop update {operation} failed: {}", error.without_url());
        }
        error => eprintln!("ERP desktop update {operation} failed: {error}"),
    }
}
