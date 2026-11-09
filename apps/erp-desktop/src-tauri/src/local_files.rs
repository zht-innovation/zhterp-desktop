use std::{
    fs::File,
    io::{Read, Write},
    path::Path,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;
use tauri_plugin_dialog::DialogExt;

use crate::transport::{decode_payload, MAX_PAYLOAD_BYTES};

const MAX_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OpenOptions {
    #[serde(default)]
    extensions: Vec<String>,
    #[serde(default)]
    multiple: bool,
    max_bytes: Option<u64>,
}

#[derive(Serialize)]
pub(crate) struct LocalFile {
    name: String,
    body: String,
}

#[tauri::command]
pub(crate) async fn open_local_files(
    window: WebviewWindow,
    options: OpenOptions,
) -> Result<Vec<LocalFile>, String> {
    tauri::async_runtime::spawn_blocking(move || pick_files(window, options))
        .await
        .map_err(|_| "无法打开文件对话框".to_owned())?
}

fn pick_files(window: WebviewWindow, options: OpenOptions) -> Result<Vec<LocalFile>, String> {
    let extensions = options.extensions.iter().map(String::as_str).collect::<Vec<_>>();
    if extensions.iter().any(|extension| {
        extension.is_empty()
            || extension.len() > 16
            || !extension.bytes().all(|byte| byte.is_ascii_alphanumeric())
    }) {
        return Err("无效的文件扩展名".into());
    }

    let mut dialog = window.dialog().file().set_parent(&window).set_title("选择文件");
    if !extensions.is_empty() {
        dialog = dialog.add_filter("支持的文件", &extensions);
    }
    let paths = if options.multiple {
        dialog.blocking_pick_files().unwrap_or_default()
    } else {
        dialog.blocking_pick_file().into_iter().collect()
    };

    let max_bytes = options.max_bytes.unwrap_or(MAX_FILE_BYTES).min(MAX_FILE_BYTES);
    let mut remaining = MAX_PAYLOAD_BYTES as u64;
    let mut files = Vec::with_capacity(paths.len());
    for selected in paths {
        let path = selected.into_path().map_err(|_| "无法访问所选文件".to_owned())?;
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .ok_or_else(|| "所选文件名无效".to_owned())?;
        let allowed_extension = path.extension().and_then(|value| value.to_str())
            .is_some_and(|extension| {
                extensions.iter().any(|expected| extension.eq_ignore_ascii_case(expected))
            });
        if !extensions.is_empty() && !allowed_extension {
            return Err("所选文件格式不受支持".into());
        }
        let limit = remaining.min(max_bytes);
        let metadata = path.metadata().map_err(|_| "无法访问所选文件".to_owned())?;
        if !metadata.is_file() {
            return Err("只能选择普通文件".into());
        }
        if metadata.len() > limit {
            return Err("所选文件超过大小限制".into());
        }
        let mut bytes = Vec::new();
        File::open(&path).map_err(|_| "无法打开所选文件".to_owned())?
            .take(limit + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| "无法读取所选文件".to_owned())?;
        if bytes.len() as u64 > limit {
            return Err("所选文件超过大小限制".into());
        }
        remaining -= bytes.len() as u64;
        files.push(LocalFile { name: name.to_owned(), body: STANDARD.encode(bytes) });
    }
    Ok(files)
}

#[tauri::command]
pub(crate) async fn save_local_file(
    window: WebviewWindow,
    name: String,
    body: String,
) -> Result<bool, String> {
    tauri::async_runtime::spawn_blocking(move || save_file(window, name, body))
        .await
        .map_err(|_| "无法打开保存对话框".to_owned())?
}

fn save_file(window: WebviewWindow, name: String, body: String) -> Result<bool, String> {
    if name.trim().is_empty()
        || name.chars().any(|character| {
            character.is_control() || matches!(character, '/' | '\\' | ':')
        })
        || Path::new(&name).file_name().and_then(|value| value.to_str()) != Some(name.as_str())
    {
        return Err("无效的保存文件名".into());
    }
    let bytes = decode_payload(&body)?;
    let selected = window
        .dialog()
        .file()
        .set_parent(&window)
        .set_title("保存文件")
        .set_file_name(name)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(false);
    };
    let path = selected.into_path().map_err(|_| "无法访问保存位置".to_owned())?;
    let parent = path.parent().ok_or_else(|| "无效的保存位置".to_owned())?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)
        .map_err(|_| "无法在所选位置创建文件".to_owned())?;
    temporary.write_all(&bytes)
        .and_then(|()| temporary.as_file().sync_all())
        .map_err(|_| "无法写入文件".to_owned())?;
    temporary.persist(path).map_err(|_| "无法保存文件".to_owned())?;
    Ok(true)
}
