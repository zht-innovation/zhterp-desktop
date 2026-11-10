use std::{collections::BTreeMap, io, time::Duration};

use base64::{engine::general_purpose::STANDARD, Engine};
use percent_encoding::percent_decode_str;
use regex::{Regex, RegexSet};
use reqwest::{
    header::{HeaderMap, HeaderName, HeaderValue, CONTENT_TYPE},
    Client, Method, Response,
};
use serde::{Deserialize, Serialize};
use tauri::{State, Url};

pub(crate) const ERP_ORIGIN: &str = env!("ERP_DESKTOP_ORIGIN");
pub(crate) const IMAGE_ORIGIN: &str = "https://server.zhtaero.com";
pub(crate) const MAX_PAYLOAD_BYTES: usize = 128 * 1024 * 1024;

const API_MAP: &str = include_str!("../../../../deploy/nginx/generated/erp-api.map");
const ATTACHMENT_CONFIG: &str = include_str!("../../../../deploy/nginx/attachments.location.conf");
const IMAGE_PATH: &str = "/image/upload";
const MAX_ERP_TIMEOUT_MS: u64 = 600_000;
const IMAGE_TIMEOUT_MS: u64 = 300_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopRequest {
    method: String,
    path: String,
    headers: BTreeMap<String, String>,
    body: Option<String>,
    timeout_ms: Option<u64>,
}

#[derive(Serialize)]
pub(crate) struct DesktopResponse {
    status: u16,
    headers: BTreeMap<String, String>,
    body: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DesktopInfo {
    erp_origin: &'static str,
}

pub(crate) struct Transport {
    client: Client,
    erp_origin: Url,
    image_origin: Url,
    api_routes: RegexSet,
    attachment_route: Regex,
}

impl Transport {
    pub(crate) fn new() -> Result<Self, Box<dyn std::error::Error>> {
        let mut routes = Vec::new();
        for line in API_MAP.lines().map(str::trim).filter(|line| !line.is_empty()) {
            let Some((pattern, owner)) = line
                .strip_prefix("\"~")
                .and_then(|line| line.split_once("\" "))
            else {
                return Err(io::Error::other("invalid desktop ERP route map").into());
            };
            if !matches!(owner, "api;" | "account;") {
                return Err(io::Error::other("invalid desktop ERP route owner").into());
            }
            routes.push(pattern);
        }

        let attachment_pattern = ATTACHMENT_CONFIG
            .lines()
            .find_map(|line| line.trim().strip_prefix("location ~ ")?.strip_suffix(" {"))
            .ok_or_else(|| io::Error::other("missing desktop attachment route"))?;
        let client = Client::builder()
            .user_agent(concat!("ZHT-ERP-Desktop/", env!("CARGO_PKG_VERSION")))
            .https_only(true)
            .redirect(reqwest::redirect::Policy::none())
            .retry(reqwest::retry::never())
            .connect_timeout(Duration::from_secs(5))
            .build()?;
        Ok(Self {
            client,
            erp_origin: Url::parse(ERP_ORIGIN)?,
            image_origin: Url::parse(IMAGE_ORIGIN)?,
            api_routes: RegexSet::new(routes)?,
            attachment_route: Regex::new(attachment_pattern)?,
        })
    }

    pub(crate) async fn notification_unread_summary(&self, token: &str) -> Result<(u16, Vec<u8>), String> {
        self.notification_get("/notification/unread-summary", token).await
    }

    pub(crate) async fn notification_profile(&self, token: &str) -> Result<(u16, Vec<u8>), String> {
        self.notification_get("/admin/profile", token).await
    }

    async fn notification_get(&self, path: &str, token: &str) -> Result<(u16, Vec<u8>), String> {
        let request = DesktopRequest {
            method: "GET".into(),
            path: path.into(),
            headers: BTreeMap::from([("Token".into(), token.into())]),
            body: None,
            timeout_ms: Some(5_000),
        };
        let response = self.send(request, false).await?;
        let body = if response.status == 200 {
            decode_payload(&response.body)?
        } else {
            Vec::new()
        };
        Ok((response.status, body))
    }

    fn allows_erp_request(&self, method: &Method, path: &str) -> bool {
        self.api_routes.is_match(&format!("{method}:{path}"))
            || ((*method == Method::GET || *method == Method::HEAD)
                && !path.ends_with('/')
                && self.attachment_route.is_match(path))
    }

    async fn send(
        &self,
        request: DesktopRequest,
        image_upload: bool,
    ) -> Result<DesktopResponse, String> {
        let method = Method::from_bytes(request.method.as_bytes())
            .map_err(|_| "不支持的请求方法".to_owned())?;
        let origin = if image_upload {
            &self.image_origin
        } else {
            &self.erp_origin
        };
        let url = request_url(origin, &request.path)?;
        if image_upload {
            if method != Method::POST || request.path != IMAGE_PATH {
                return Err("不允许的图片上传地址".into());
            }
        } else if !self.allows_erp_request(&method, url.path()) {
            return Err("不允许的 ERP 接口".into());
        }

        let headers = request_headers(request.headers, image_upload)?;
        let (default_timeout, max_timeout) = if image_upload {
            (IMAGE_TIMEOUT_MS, IMAGE_TIMEOUT_MS)
        } else {
            (30_000, MAX_ERP_TIMEOUT_MS)
        };
        let timeout = request.timeout_ms.unwrap_or(default_timeout).clamp(1, max_timeout);
        let mut outgoing = self.client
            .request(method, url)
            .headers(headers)
            .timeout(Duration::from_millis(timeout));
        if let Some(body) = request.body {
            outgoing = outgoing.body(decode_payload(&body)?);
        }
        let response = outgoing.send().await.map_err(network_error)?;
        read_response(response).await
    }
}

fn request_url(origin: &Url, path: &str) -> Result<Url, String> {
    let pathname = path.split('?').next().unwrap_or_default();
    if !pathname.starts_with('/')
        || pathname.starts_with("//")
        || pathname.contains('\\')
        || path.contains('#')
        || path.chars().any(char::is_control)
    {
        return Err("不允许的请求路径".into());
    }
    for segment in pathname.split('/') {
        let decoded = percent_decode_str(segment)
            .decode_utf8()
            .map_err(|_| "无效的请求路径".to_owned())?;
        if matches!(decoded.as_ref(), "." | "..")
            || decoded.chars().any(|character| {
                character.is_control() || matches!(character, '/' | '\\')
            })
        {
            return Err("不允许的请求路径".into());
        }
    }

    let url = origin.join(path).map_err(|_| "无效的请求路径".to_owned())?;
    if url.origin() != origin.origin() {
        return Err("不允许的请求地址".into());
    }
    Ok(url)
}

fn request_headers(
    incoming: BTreeMap<String, String>,
    image_upload: bool,
) -> Result<HeaderMap, String> {
    let mut headers = HeaderMap::new();
    for (key, value) in incoming {
        let key = key.to_ascii_lowercase();
        let shared_header = matches!(key.as_str(), "accept" | "content-type");
        let erp_header = matches!(
            key.as_str(),
            "token" | "idempotency-key" | "range" | "if-none-match" | "if-modified-since"
        );
        if shared_header || (!image_upload && erp_header) {
            let name = HeaderName::from_bytes(key.as_bytes()).map_err(|_| "无效的请求头".to_owned())?;
            let mut header = HeaderValue::from_str(&value).map_err(|_| "无效的请求头值".to_owned())?;
            if key == "token" {
                header.set_sensitive(true);
            }
            headers.insert(name, header);
        }
    }
    if image_upload {
        let is_multipart = headers
            .get(CONTENT_TYPE)
            .and_then(|value| value.to_str().ok())
            .is_some_and(|value| value.starts_with("multipart/form-data; boundary="));
        if !is_multipart {
            return Err("图片上传需要 multipart/form-data".into());
        }
    }
    Ok(headers)
}

pub(crate) fn decode_payload(encoded: &str) -> Result<Vec<u8>, String> {
    if encoded.len() > MAX_PAYLOAD_BYTES.div_ceil(3) * 4 {
        return Err("数据超过桌面客户端大小限制".into());
    }
    let bytes = STANDARD.decode(encoded).map_err(|_| "无效的文件或请求数据".to_owned())?;
    if bytes.len() > MAX_PAYLOAD_BYTES {
        return Err("数据超过桌面客户端大小限制".into());
    }
    Ok(bytes)
}

fn network_error(error: reqwest::Error) -> String {
    if error.is_timeout() {
        "ERP_NETWORK: 请求超时，请检查网络后重试".into()
    } else {
        "ERP_NETWORK: 无法连接 ERP 或读取响应，请检查网络后重试".into()
    }
}

async fn read_response(mut response: Response) -> Result<DesktopResponse, String> {
    let status = response.status().as_u16();
    let mut headers = BTreeMap::<String, String>::new();
    for (key, value) in response.headers() {
        if matches!(key.as_str(), "set-cookie" | "set-cookie2") {
            continue;
        }
        let value = value.as_bytes().iter().copied().map(char::from).collect::<String>();
        headers
            .entry(key.to_string())
            .and_modify(|current| {
                current.push_str(", ");
                current.push_str(&value);
            })
            .or_insert(value);
    }
    if response.content_length().is_some_and(|length| length > MAX_PAYLOAD_BYTES as u64) {
        return Err("响应超过桌面客户端大小限制".into());
    }
    let mut bytes = Vec::new();
    while let Some(chunk) = response.chunk().await.map_err(network_error)? {
        if chunk.len() > MAX_PAYLOAD_BYTES - bytes.len() {
            return Err("响应超过桌面客户端大小限制".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    Ok(DesktopResponse { status, headers, body: STANDARD.encode(bytes) })
}

#[tauri::command]
pub(crate) fn desktop_info() -> DesktopInfo {
    DesktopInfo { erp_origin: ERP_ORIGIN }
}

#[tauri::command]
pub(crate) async fn erp_request(
    state: State<'_, Transport>,
    request: DesktopRequest,
) -> Result<DesktopResponse, String> {
    state.send(request, false).await
}

#[tauri::command]
pub(crate) async fn upload_product_image(
    state: State<'_, Transport>,
    request: DesktopRequest,
) -> Result<DesktopResponse, String> {
    state.send(request, true).await
}
