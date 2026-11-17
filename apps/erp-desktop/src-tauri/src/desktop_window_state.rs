use std::{
    fs,
    io::{self, Write},
    path::PathBuf,
    sync::{atomic::{AtomicBool, AtomicU64, Ordering}, Mutex},
    time::Duration,
};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Monitor, PhysicalPosition, PhysicalSize, WebviewWindow, WindowEvent};

const DEFAULT_WIDTH: f64 = 1360.0;
const DEFAULT_HEIGHT: f64 = 860.0;
const MIN_WIDTH: f64 = 900.0;
const MIN_HEIGHT: f64 = 600.0;
const SAVE_DELAY: Duration = Duration::from_millis(250);

#[cfg(target_os = "windows")]
#[link(name = "user32")]
unsafe extern "system" {
    fn IsIconic(window: *mut std::ffi::c_void) -> i32;
    fn IsZoomed(window: *mut std::ffi::c_void) -> i32;
}

struct WindowMode {
    minimized: bool,
    maximized: bool,
}

fn window_mode(window: &WebviewWindow) -> tauri::Result<WindowMode> {
    #[cfg(target_os = "windows")]
    {
        let handle = window.hwnd()?;
        // Windows sends Moved before Tauri updates its maximize/minimize cache.
        // SAFETY: these read-only APIs use the live HWND obtained from Tauri.
        Ok(unsafe {
            WindowMode {
                minimized: IsIconic(handle.0 as *mut std::ffi::c_void) != 0,
                maximized: IsZoomed(handle.0 as *mut std::ffi::c_void) != 0,
            }
        })
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(WindowMode {
            minimized: window.is_minimized()?,
            maximized: window.is_maximized()?,
        })
    }
}

#[derive(Clone, Deserialize, Serialize)]
struct Bounds {
    x: i32,
    y: i32,
    width: f64,
    height: f64,
    scale: f64,
    monitor_name: Option<String>,
    monitor_x: i32,
    monitor_y: i32,
}

impl Bounds {
    fn valid(&self) -> bool {
        self.width.is_finite() && self.width > 0.0 && self.width <= 100_000.0
            && self.height.is_finite() && self.height > 0.0 && self.height <= 100_000.0
            && self.scale.is_finite() && self.scale > 0.0 && self.scale <= 16.0
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
struct SavedState {
    bounds: Option<Bounds>,
    maximized: bool,
}

struct Memory {
    saved: SavedState,
    pending_maximized: bool,
}

struct WindowState {
    path: Option<PathBuf>,
    ready: AtomicBool,
    adjusting: AtomicBool,
    needs_fit: AtomicBool,
    generation: AtomicU64,
    memory: Mutex<Memory>,
}

fn report(action: &str, error: impl std::fmt::Display) {
    eprintln!("Failed to {action} ERP window state: {error}");
}

pub(crate) fn init(app: &AppHandle) {
    let path = match app.path().app_local_data_dir() {
        Ok(directory) => Some(directory.join("main-window-state.json")),
        Err(error) => {
            report("locate", error);
            None
        }
    };
    let mut saved = SavedState::default();
    if let Some(path) = &path {
        match fs::read(path) {
            Ok(bytes) => match serde_json::from_slice::<SavedState>(&bytes) {
                Ok(value) if value.bounds.as_ref().is_none_or(Bounds::valid) => saved = value,
                Ok(_) => report("read", "invalid window bounds"),
                Err(error) => report("read", error),
            },
            Err(error) if error.kind() == io::ErrorKind::NotFound => {}
            Err(error) => report("read", error),
        }
    }
    let pending_maximized = saved.maximized;
    app.manage(WindowState {
        path,
        ready: AtomicBool::new(false),
        adjusting: AtomicBool::new(false),
        needs_fit: AtomicBool::new(false),
        generation: AtomicU64::new(0),
        memory: Mutex::new(Memory { saved, pending_maximized }),
    });
}

pub(crate) fn is_ready(app: &AppHandle) -> bool {
    app.try_state::<WindowState>().is_some_and(|state| state.ready.load(Ordering::Acquire))
}

fn monitors(window: &WebviewWindow) -> tauri::Result<Vec<Monitor>> {
    let mut monitors = window.available_monitors()?;
    monitors.retain(|monitor| {
        let size = &monitor.work_area().size;
        size.width > 0 && size.height > 0
            && monitor.scale_factor().is_finite() && monitor.scale_factor() > 0.0
    });
    Ok(monitors)
}

fn fallback_monitor(window: &WebviewWindow, monitors: &[Monitor]) -> Option<Monitor> {
    window.primary_monitor().ok().flatten()
        .filter(|primary| monitors.iter().any(|monitor| monitor.position() == primary.position()))
        .or_else(|| monitors.first().cloned())
}

fn saved_monitor(bounds: &Bounds, monitors: &[Monitor]) -> Option<Monitor> {
    if let Some(name) = &bounds.monitor_name {
        if let Some(monitor) = monitors.iter().find(|monitor| {
            monitor.name() == Some(name)
                && monitor.work_area().position.x == bounds.monitor_x
                && monitor.work_area().position.y == bounds.monitor_y
        }) {
            return Some(monitor.clone());
        }
        if let Some(monitor) = monitors.iter().find(|monitor| monitor.name() == Some(name)) {
            return Some(monitor.clone());
        }
    }
    monitors.iter().find(|monitor| {
        let position = &monitor.work_area().position;
        position.x == bounds.monitor_x && position.y == bounds.monitor_y
    }).cloned()
}

fn intersects(position: PhysicalPosition<i32>, size: PhysicalSize<u32>, monitor: &Monitor) -> bool {
    let area = monitor.work_area();
    i64::from(position.x) < i64::from(area.position.x) + i64::from(area.size.width)
        && i64::from(position.x) + i64::from(size.width) > i64::from(area.position.x)
        && i64::from(position.y) < i64::from(area.position.y) + i64::from(area.size.height)
        && i64::from(position.y) + i64::from(size.height) > i64::from(area.position.y)
}

fn read_bounds(window: &WebviewWindow, monitor: &Monitor) -> tauri::Result<Bounds> {
    let position = window.outer_position()?;
    let size = window.inner_size()?;
    let scale = window.scale_factor()?;
    let area = monitor.work_area();
    Ok(Bounds {
        x: position.x,
        y: position.y,
        width: f64::from(size.width) / scale,
        height: f64::from(size.height) / scale,
        scale,
        monitor_name: monitor.name().cloned(),
        monitor_x: area.position.x,
        monitor_y: area.position.y,
    })
}

// Bounds store logical client size and physical frame position. Frame insets must
// also fit on the destination display, including when its scaling has changed.
fn fit_bounds(window: &WebviewWindow, bounds: Option<&Bounds>, monitor: &Monitor, keep_position: bool) -> tauri::Result<()> {
    let area = monitor.work_area();
    let scale = monitor.scale_factor();
    let current_monitor = window.current_monitor()?;
    if current_monitor.as_ref().is_none_or(|current| current.position() != monitor.position()) {
        // Moving across displays can resize the window through WM_DPICHANGED.
        // Move first, then apply the saved logical size at the destination DPI.
        window.set_position(area.position)?;
    }
    let current_scale = window.scale_factor()?;
    let inner = window.inner_size()?;
    let outer = window.outer_size()?;
    let frame_width = (f64::from(outer.width.saturating_sub(inner.width)) / current_scale * scale).ceil();
    let frame_height = (f64::from(outer.height.saturating_sub(inner.height)) / current_scale * scale).ceil();
    let available_width = (f64::from(area.size.width) - frame_width).max(1.0);
    let available_height = (f64::from(area.size.height) - frame_height).max(1.0);
    let min_width = (MIN_WIDTH * scale).min(available_width).floor().max(1.0) as u32;
    let min_height = (MIN_HEIGHT * scale).min(available_height).floor().max(1.0) as u32;
    let width = (bounds.map_or(DEFAULT_WIDTH, |value| value.width) * scale)
        .clamp(f64::from(min_width), available_width).floor() as u32;
    let height = (bounds.map_or(DEFAULT_HEIGHT, |value| value.height) * scale)
        .clamp(f64::from(min_height), available_height).floor() as u32;
    let outer_width = f64::from(width) + frame_width;
    let outer_height = f64::from(height) + frame_height;
    let left = f64::from(area.position.x);
    let top = f64::from(area.position.y);
    let right = left + (f64::from(area.size.width) - outer_width).max(0.0);
    let bottom = top + (f64::from(area.size.height) - outer_height).max(0.0);
    let (x, y) = match bounds.filter(|_| keep_position) {
        Some(value) => (
            left + (f64::from(value.x) - f64::from(value.monitor_x)) / value.scale * scale,
            top + (f64::from(value.y) - f64::from(value.monitor_y)) / value.scale * scale,
        ),
        None => ((left + right) / 2.0, (top + bottom) / 2.0),
    };
    let position = PhysicalPosition::new(x.clamp(left, right).round() as i32, y.clamp(top, bottom).round() as i32);
    window.set_min_size(Some(PhysicalSize::new(min_width, min_height)))?;
    let size = PhysicalSize::new(width, height);
    if inner != size {
        window.set_size(size)?;
    }
    if window.outer_position()? != position {
        window.set_position(position)?;
    }
    Ok(())
}

pub(crate) fn restore(window: &WebviewWindow) {
    if window.label() != crate::MAIN_WINDOW {
        return;
    }
    let Some(state) = window.app_handle().try_state::<WindowState>() else { return };
    if state.ready.load(Ordering::Acquire) {
        return;
    }
    let bounds = state.memory.lock().unwrap_or_else(|error| error.into_inner()).saved.bounds.clone();
    match monitors(window) {
        Ok(monitors) => {
            let matched = bounds.as_ref().and_then(|bounds| saved_monitor(bounds, &monitors));
            let keep_position = matched.is_some();
            if let Some(monitor) = matched.or_else(|| fallback_monitor(window, &monitors)) {
                if let Err(error) = fit_bounds(window, bounds.as_ref(), &monitor, keep_position) {
                    report("restore", error);
                }
            }
        }
        Err(error) => report("restore", error),
    }
    let observed = window.clone();
    window.on_window_event(move |event| match event {
        WindowEvent::Moved(_) => schedule_save(&observed, false),
        WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } | WindowEvent::Focused(true) =>
            schedule_save(&observed, true),
        _ => {}
    });
    if let Err(error) = capture(window) {
        report("capture", error);
    }
    state.ready.store(true, Ordering::Release);
}

// Called only when the user explicitly opens the window. Maximizing a hidden
// Windows window may make it visible, so startup deliberately defers this step.
pub(crate) fn restore_maximized(window: &WebviewWindow) {
    if window.label() != crate::MAIN_WINDOW {
        return;
    }
    let Some(state) = window.app_handle().try_state::<WindowState>() else { return };
    let pending = {
        let mut memory = state.memory.lock().unwrap_or_else(|error| error.into_inner());
        std::mem::take(&mut memory.pending_maximized)
    };
    if pending {
        if let Err(error) = window.maximize() {
            report("maximize", error);
        }
    }
}

pub(crate) fn ensure_visible(window: &WebviewWindow) {
    if window.label() != crate::MAIN_WINDOW {
        return;
    }
    let Some(state) = window.app_handle().try_state::<WindowState>() else { return };
    if state.adjusting.swap(true, Ordering::AcqRel) {
        return;
    }
    if let Err(error) = fit_current(window) {
        report("fit", error);
    }
    state.adjusting.store(false, Ordering::Release);
}

fn fit_current(window: &WebviewWindow) -> tauri::Result<()> {
    let mode = window_mode(window)?;
    if mode.minimized || window.is_fullscreen()? {
        return Ok(());
    }
    let monitors = monitors(window)?;
    let position = window.outer_position()?;
    let size = window.outer_size()?;
    let intersects_screen = monitors.iter().any(|monitor| intersects(position, size, monitor));
    let maximized = mode.maximized;
    if maximized && intersects_screen {
        return Ok(());
    }
    let current_monitor = window.current_monitor()?;
    let monitor = current_monitor.filter(|current| monitors.iter().any(|monitor| monitor.position() == current.position()))
        .or_else(|| fallback_monitor(window, &monitors));
    let Some(monitor) = monitor else { return Ok(()) };
    if maximized {
        let state = window.state::<WindowState>();
        let bounds = {
            let mut memory = state.memory.lock().unwrap_or_else(|error| error.into_inner());
            memory.pending_maximized = true;
            memory.saved.bounds.clone()
        };
        window.unmaximize()?;
        fit_bounds(window, bounds.as_ref(), &monitor, false)?;
        if window.is_visible()? {
            restore_maximized(window);
        }
    } else {
        let bounds = read_bounds(window, &monitor)?;
        fit_bounds(window, Some(&bounds), &monitor, intersects_screen)?;
    }
    Ok(())
}

fn capture(window: &WebviewWindow) -> tauri::Result<()> {
    let state = window.state::<WindowState>();
    if state.adjusting.load(Ordering::Acquire) {
        return Ok(());
    }
    let mode = window_mode(window)?;
    if mode.minimized || window.is_fullscreen()? {
        return Ok(());
    }
    let maximized = mode.maximized;
    let pending = state.memory.lock().unwrap_or_else(|error| error.into_inner()).pending_maximized;
    let bounds = if !maximized {
        window.current_monitor()?.map(|monitor| read_bounds(window, &monitor)).transpose()?
    } else {
        None
    };
    let mut memory = state.memory.lock().unwrap_or_else(|error| error.into_inner());
    if let Some(bounds) = bounds.filter(Bounds::valid) {
        memory.saved.bounds = Some(bounds);
    }
    if !pending {
        memory.saved.maximized = maximized;
    }
    Ok(())
}

fn persist(app: &AppHandle) {
    let Some(state) = app.try_state::<WindowState>() else { return };
    let Some(path) = &state.path else { return };
    // Keep the lock until the small atomic write completes: an older timer must
    // never replace a newer explicit close/exit snapshot. No window API is called.
    let memory = state.memory.lock().unwrap_or_else(|error| error.into_inner());
    let result = (|| -> Result<(), Box<dyn std::error::Error>> {
        let parent = path.parent().ok_or_else(|| io::Error::other("missing state directory"))?;
        fs::create_dir_all(parent)?;
        let mut file = tempfile::NamedTempFile::new_in(parent)?;
        file.write_all(&serde_json::to_vec(&memory.saved)?)?;
        file.as_file().sync_all()?;
        file.persist(path)?;
        Ok(())
    })();
    if let Err(error) = result {
        report("save", error);
    }
}

pub(crate) fn save(window: &WebviewWindow) {
    if window.label() != crate::MAIN_WINDOW || !is_ready(window.app_handle()) {
        return;
    }
    let state = window.state::<WindowState>();
    state.generation.fetch_add(1, Ordering::AcqRel);
    if let Err(error) = capture(window) {
        report("capture", error);
    }
    persist(window.app_handle());
}

fn schedule_save(window: &WebviewWindow, needs_fit: bool) {
    let Some(state) = window.app_handle().try_state::<WindowState>() else { return };
    if !state.ready.load(Ordering::Acquire) || state.adjusting.load(Ordering::Acquire) {
        return;
    }
    // Capture transitions immediately; only disk writes are debounced. A resize
    // followed quickly by maximize/minimize must retain the last normal bounds.
    if let Err(error) = capture(window) {
        report("capture", error);
    }
    if needs_fit {
        state.needs_fit.store(true, Ordering::Release);
    }
    let generation = state.generation.fetch_add(1, Ordering::AcqRel) + 1;
    let window = window.clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(SAVE_DELAY).await;
        let handle = window.app_handle().clone();
        if let Err(error) = handle.run_on_main_thread(move || {
            let Some(state) = window.app_handle().try_state::<WindowState>() else { return };
            if state.generation.load(Ordering::Acquire) != generation {
                return;
            }
            let needs_fit = state.needs_fit.swap(false, Ordering::AcqRel);
            if window.is_visible().unwrap_or(false) {
                let offscreen = match (monitors(&window), window.outer_position(), window.outer_size()) {
                    (Ok(monitors), Ok(position), Ok(size)) if !monitors.is_empty() =>
                        !monitors.iter().any(|monitor| intersects(position, size, monitor)),
                    _ => false,
                };
                if needs_fit || offscreen {
                    ensure_visible(&window);
                }
            }
            if let Err(error) = capture(&window) {
                report("capture", error);
            }
            persist(window.app_handle());
        }) {
            report("schedule", error);
        }
    });
}
