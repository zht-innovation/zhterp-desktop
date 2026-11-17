//! Native printer discovery and spool submission. Success means accepted by the
//! operating system, never proof that a physical page has left the printer.
use serde::{Deserialize, Serialize};
use tauri::WebviewWindow;

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Paper {
    pub id: String,
    pub name: String,
    pub width_mm: f64,
    pub height_mm: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Printer {
    pub name: String,
    pub papers: Vec<Paper>,
}

#[derive(Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct PrintSettings {
    pub printer: String,
    pub paper: Paper,
    pub landscape: bool,
    pub copies: u32,
}

pub(crate) fn validate(settings: &PrintSettings, printers: &[Printer]) -> Result<(), String> {
    if !(1..=99).contains(&settings.copies) {
        return Err("打印份数须为 1 至 99".into());
    }
    let printer = printers.iter().find(|p| p.name == settings.printer)
        .ok_or("打印机已不可用，请重新选择打印机")?;
    if !printer.papers.iter().any(|p| p.id == settings.paper.id
        && (p.width_mm - settings.paper.width_mm).abs() < 0.2
        && (p.height_mm - settings.paper.height_mm).abs() < 0.2) {
        return Err("打印机不支持所选纸型，请在系统打印机设置中添加纸型后重新选择")
            .map_err(str::to_owned);
    }
    Ok(())
}

#[cfg(windows)]
mod platform {
    use super::*;
    use std::{ffi::c_void, ptr, sync::{Arc, Mutex}};
    use windows::core::{Interface, PCWSTR};
    use webview2_com::{Microsoft::Web::WebView2::Win32::*, PrintCompletedHandler};

    #[repr(C)]
    struct PrinterInfo2 {
        server: *const u16, name: *const u16, share: *const u16, port: *const u16,
        driver: *const u16, comment: *const u16, location: *const u16, mode: *const c_void,
        separator: *const u16, processor: *const u16, datatype: *const u16,
        parameters: *const u16, security: *const c_void,
        attributes: u32, priority: u32, default_priority: u32, start: u32, until: u32,
        status: u32, jobs: u32, average_ppm: u32,
    }
    #[repr(C)]
    #[derive(Clone, Copy, Default)]
    struct Point { x: i32, y: i32 }

    #[link(name = "winspool")]
    unsafe extern "system" {
        fn EnumPrintersW(flags: u32, name: *const u16, level: u32, buffer: *mut u8,
            size: u32, needed: *mut u32, returned: *mut u32) -> i32;
        fn DeviceCapabilitiesW(device: *const u16, port: *const u16, capability: u16,
            output: *mut u16, mode: *const c_void) -> i32;
    }

    fn wide(value: &str) -> Vec<u16> { value.encode_utf16().chain(Some(0)).collect() }
    unsafe fn name_at(value: *const u16) -> String {
        if value.is_null() { return String::new(); }
        let mut length = 0;
        while length < 1024 && *value.add(length) != 0 { length += 1; }
        String::from_utf16_lossy(std::slice::from_raw_parts(value, length))
    }

    pub(super) fn printers() -> Result<Vec<Printer>, String> {
        unsafe {
            let (mut needed, mut count) = (0, 0);
            EnumPrintersW(2 | 4, ptr::null(), 2, ptr::null_mut(), 0, &mut needed, &mut count);
            if needed == 0 { return Ok(Vec::new()); }
            if needed > 16 * 1024 * 1024 { return Err("系统打印机列表过大".into()); }
            let mut bytes = vec![0_u8; needed as usize];
            if EnumPrintersW(2 | 4, ptr::null(), 2, bytes.as_mut_ptr(), needed, &mut needed, &mut count) == 0 {
                return Err("读取系统打印机失败".into());
            }
            let mut result = Vec::new();
            for index in 0..count as usize {
                let offset = index * std::mem::size_of::<PrinterInfo2>();
                if offset + std::mem::size_of::<PrinterInfo2>() > bytes.len() { break; }
                let info = ptr::read_unaligned(bytes.as_ptr().add(offset).cast::<PrinterInfo2>());
                let name = name_at(info.name);
                if name.is_empty() { continue; }
                let device = wide(&name);
                let paper_count = DeviceCapabilitiesW(device.as_ptr(), info.port, 2, ptr::null_mut(), ptr::null());
                let mut papers = Vec::new();
                if (1..=1024).contains(&paper_count) {
                    let count = paper_count as usize;
                    let mut ids = vec![0_u16; count];
                    let mut sizes = vec![Point::default(); count];
                    let mut names = vec![0_u16; count * 64];
                    let a = DeviceCapabilitiesW(device.as_ptr(), info.port, 2, ids.as_mut_ptr(), ptr::null());
                    let b = DeviceCapabilitiesW(device.as_ptr(), info.port, 3, sizes.as_mut_ptr().cast(), ptr::null());
                    let c = DeviceCapabilitiesW(device.as_ptr(), info.port, 16, names.as_mut_ptr(), ptr::null());
                    if a == paper_count && b == paper_count && c == paper_count {
                        for i in 0..count {
                            if sizes[i].x <= 0 || sizes[i].y <= 0 { continue; }
                            let text = &names[i * 64..(i + 1) * 64];
                            let length = text.iter().position(|x| *x == 0).unwrap_or(64);
                            papers.push(Paper { id: ids[i].to_string(), name: String::from_utf16_lossy(&text[..length]),
                                width_mm: sizes[i].x as f64 / 10.0, height_mm: sizes[i].y as f64 / 10.0 });
                        }
                    }
                }
                result.push(Printer { name, papers });
            }
            Ok(result)
        }
    }

    pub(super) async fn submit(window: &WebviewWindow, settings: PrintSettings) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let sender = Arc::new(Mutex::new(Some(tx)));
        let callback_sender = sender.clone();
        window.with_webview(move |webview| {
            let result = (|| -> windows::core::Result<()> { unsafe {
                let environment = webview.environment().cast::<ICoreWebView2Environment6>()?;
                let print = environment.CreatePrintSettings()?;
                let extended = print.cast::<ICoreWebView2PrintSettings2>()?;
                let printer = wide(&settings.printer);
                extended.SetPrinterName(PCWSTR(printer.as_ptr()))?;
                extended.SetCopies(settings.copies as i32)?;
                extended.SetMediaSize(COREWEBVIEW2_PRINT_MEDIA_SIZE_CUSTOM)?;
                extended.SetPagesPerSide(1)?;
                extended.SetDuplex(COREWEBVIEW2_PRINT_DUPLEX_ONE_SIDED)?;
                print.SetOrientation(if settings.landscape { COREWEBVIEW2_PRINT_ORIENTATION_LANDSCAPE }
                    else { COREWEBVIEW2_PRINT_ORIENTATION_PORTRAIT })?;
                print.SetPageWidth(settings.paper.width_mm / 25.4)?;
                print.SetPageHeight(settings.paper.height_mm / 25.4)?;
                print.SetMarginTop(0.0)?;
                print.SetMarginBottom(0.0)?;
                print.SetMarginLeft(0.0)?;
                print.SetMarginRight(0.0)?;
                print.SetScaleFactor(1.0)?;
                print.SetShouldPrintBackgrounds(true.into())?;
                print.SetShouldPrintHeaderAndFooter(false.into())?;
                let callback = PrintCompletedHandler::create(Box::new(move |result, status| {
                    let outcome = if result.is_err() { Err("系统未能确认打印提交结果，请先检查系统打印队列".into()) }
                        else if status == COREWEBVIEW2_PRINT_STATUS_SUCCEEDED { Ok(()) }
                        else if status == COREWEBVIEW2_PRINT_STATUS_PRINTER_UNAVAILABLE { Err("打印机不可用，请重新选择".into()) }
                        else { Err("系统拒绝了打印任务，请检查打印机及纸型".into()) };
                    if let Ok(mut sender) = callback_sender.lock() {
                        if let Some(sender) = sender.take() { let _ = sender.send(outcome); }
                    }
                    Ok(())
                }));
                webview.controller().CoreWebView2()?.cast::<ICoreWebView2_16>()?.Print(&print, &callback)
            }})();
            if let Err(error) = result {
                if let Ok(mut sender) = sender.lock() {
                    if let Some(sender) = sender.take() {
                        let _ = sender.send(Err(format!("原生打印接口不可用：{error}（请检查 WebView2 运行时）")));
                    }
                }
            }
        }).map_err(|error| error.to_string())?;
        rx.await.map_err(|_| "系统打印回调中断，提交结果未知".to_owned())?
    }
}

#[cfg(target_os = "macos")]
mod platform {
    use super::*;
    use std::{ffi::c_void, ptr};
    use objc2::{class, msg_send, sel, rc::Retained, runtime::AnyObject};
    use objc2_foundation::{NSSize, NSString};

    type NativeRef = *const c_void;
    #[link(name = "AppKit", kind = "framework")]
    unsafe extern "C" {
        static NSPrintCopies: *const NSString;
        static NSPrintAllPages: *const NSString;
        static NSPrintSpoolJob: *const NSString;
    }
    #[link(name = "ApplicationServices", kind = "framework")]
    unsafe extern "C" {
        fn PMServerCreatePrinterList(server: NativeRef, list: *mut NativeRef) -> i32;
        fn PMPrinterGetName(printer: NativeRef) -> NativeRef;
        fn PMPrinterGetPaperList(printer: NativeRef, papers: *mut NativeRef) -> i32;
        fn PMPaperGetID(paper: NativeRef, id: *mut NativeRef) -> i32;
        fn PMPaperGetWidth(paper: NativeRef, width: *mut f64) -> i32;
        fn PMPaperGetHeight(paper: NativeRef, height: *mut f64) -> i32;
        fn PMCreatePageFormatWithPMPaper(format: *mut NativeRef, paper: NativeRef) -> i32;
        fn PMCopyPageFormat(source: NativeRef, destination: NativeRef) -> i32;
        fn PMRelease(object: NativeRef) -> i32;
    }
    #[link(name = "CoreFoundation", kind = "framework")]
    unsafe extern "C" {
        fn CFArrayGetCount(array: NativeRef) -> isize;
        fn CFArrayGetValueAtIndex(array: NativeRef, index: isize) -> NativeRef;
        fn CFRelease(object: NativeRef);
    }
    struct PrinterList(NativeRef);
    impl Drop for PrinterList { fn drop(&mut self) { unsafe { CFRelease(self.0); } } }
    unsafe fn printer_list() -> Result<PrinterList, String> {
        let mut list = ptr::null();
        if PMServerCreatePrinterList(ptr::null(), &mut list) != 0 || list.is_null() { return Err("无法读取系统打印机列表".into()); }
        Ok(PrinterList(list))
    }
    unsafe fn text(value: NativeRef) -> String {
        if value.is_null() { return String::new(); }
        // CFString and NSString are toll-free bridged; no ownership transfer.
        (&*value.cast::<NSString>()).to_string()
    }
    unsafe fn paper_entries(printer: NativeRef) -> Vec<(NativeRef, Paper)> {
        let mut list = ptr::null();
        if PMPrinterGetPaperList(printer, &mut list) != 0 || list.is_null() { return Vec::new(); }
        let mut result = Vec::new();
        for index in 0..CFArrayGetCount(list).min(1024) {
            let paper = CFArrayGetValueAtIndex(list, index);
            let (mut id, mut width, mut height) = (ptr::null(), 0.0, 0.0);
            if PMPaperGetID(paper, &mut id) == 0 && PMPaperGetWidth(paper, &mut width) == 0
                && PMPaperGetHeight(paper, &mut height) == 0 && width > 0.0 && height > 0.0 {
                let id = text(id);
                result.push((paper, Paper { id: id.clone(), name: id,
                    width_mm: width * 25.4 / 72.0, height_mm: height * 25.4 / 72.0 }));
            }
        }
        result
    }

    pub(super) fn printers() -> Result<Vec<Printer>, String> {
        // Core Printing also enumerates AirPrint/non-PPD paper capabilities.
        objc2::rc::autoreleasepool(|_| unsafe {
            let list = printer_list()?;
            let mut result = Vec::new();
            for index in 0..CFArrayGetCount(list.0).min(1024) {
                let printer = CFArrayGetValueAtIndex(list.0, index);
                result.push(Printer { name: text(PMPrinterGetName(printer)),
                    papers: paper_entries(printer).into_iter().map(|(_, paper)| paper).collect() });
            }
            Ok(result)
        })
    }

    pub(super) async fn submit(window: &WebviewWindow, settings: PrintSettings) -> Result<(), String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        window.with_webview(move |webview| {
            let result = objc2::rc::autoreleasepool(|_| unsafe {
                let printer: Option<Retained<AnyObject>> = msg_send![class!(NSPrinter),
                    printerWithName: &*NSString::from_str(&settings.printer)];
                let Some(printer) = printer else { return Err("打印机已不可用".to_owned()); };
                let shared: Retained<AnyObject> = msg_send![class!(NSPrintInfo), sharedPrintInfo];
                let info: Retained<AnyObject> = msg_send![&*shared, copy];
                let _: () = msg_send![&*info, setPrinter: &*printer];
                let list = printer_list()?;
                let mut selected_paper = None;
                for index in 0..CFArrayGetCount(list.0).min(1024) {
                    let candidate = CFArrayGetValueAtIndex(list.0, index);
                    if text(PMPrinterGetName(candidate)) == settings.printer {
                        selected_paper = paper_entries(candidate).into_iter().find(|(_, paper)| paper.id == settings.paper.id);
                        break;
                    }
                }
                let (paper, _) = selected_paper.ok_or("打印机纸型已变化，请重新选择".to_owned())?;
                let mut format = ptr::null();
                if PMCreatePageFormatWithPMPaper(&mut format, paper) != 0 || format.is_null() { return Err("无法创建原生纸型".into()); }
                let destination: NativeRef = msg_send![&*info, PMPageFormat];
                let copied = PMCopyPageFormat(format, destination);
                PMRelease(format);
                if copied != 0 { return Err("无法设置原生纸型".into()); }
                let _: () = msg_send![&*info, updateFromPMPageFormat];
                let _: () = msg_send![&*info, setPaperSize: NSSize::new(settings.paper.width_mm * 72.0 / 25.4,
                    settings.paper.height_mm * 72.0 / 25.4)];
                let _: () = msg_send![&*info, setOrientation: if settings.landscape { 1_isize } else { 0_isize }];
                let _: () = msg_send![&*info, setTopMargin: 0.0_f64];
                let _: () = msg_send![&*info, setBottomMargin: 0.0_f64];
                let _: () = msg_send![&*info, setLeftMargin: 0.0_f64];
                let _: () = msg_send![&*info, setRightMargin: 0.0_f64];
                let _: () = msg_send![&*info, setScalingFactor: 1.0_f64];
                let _: () = msg_send![&*info, setHorizontallyCentered: false];
                let _: () = msg_send![&*info, setVerticallyCentered: false];
                let _: () = msg_send![&*info, setJobDisposition: &*NSPrintSpoolJob];
                let dictionary: Retained<AnyObject> = msg_send![&*info, dictionary];
                let copies: Retained<AnyObject> = msg_send![class!(NSNumber), numberWithInt: settings.copies as i32];
                let _: () = msg_send![&*dictionary, setObject: &*copies forKey: &*NSPrintCopies];
                let all_pages: Retained<AnyObject> = msg_send![class!(NSNumber), numberWithBool: true];
                let _: () = msg_send![&*dictionary, setObject: &*all_pages forKey: &*NSPrintAllPages];
                let view = &*(webview.inner().cast::<AnyObject>());
                let can_print: bool = msg_send![view, respondsToSelector: sel!(printOperationWithPrintInfo:)];
                if !can_print { return Err("当前 macOS WebKit 版本不支持此原生打印接口".into()); }
                let operation: Retained<AnyObject> = msg_send![view, printOperationWithPrintInfo: &*info];
                let _: () = msg_send![&*operation, setShowsPrintPanel: false];
                let _: () = msg_send![&*operation, setShowsProgressPanel: false];
                let accepted: bool = msg_send![&*operation, runOperation];
                if accepted { Ok(()) } else { Err("系统未接受打印任务，请检查打印机状态".into()) }
            });
            let _ = tx.send(result);
        }).map_err(|error| error.to_string())?;
        rx.await.map_err(|_| "系统打印回调中断，提交结果未知".to_owned())?
    }
}

#[cfg(not(any(windows, target_os = "macos")))]
mod platform {
    use super::*;
    pub(super) fn printers() -> Result<Vec<Printer>, String> { Err("此平台尚未支持原生打印".into()) }
    pub(super) async fn submit(_: &WebviewWindow, _: PrintSettings) -> Result<(), String> { Err("此平台尚未支持原生打印".into()) }
}

pub(crate) fn printers() -> Result<Vec<Printer>, String> { platform::printers() }
pub(crate) async fn submit(window: &WebviewWindow, settings: PrintSettings) -> Result<(), String> {
    platform::submit(window, settings).await
}
