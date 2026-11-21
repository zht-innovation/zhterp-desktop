use std::mem::size_of;
use windows::core::PWSTR;
use windows::Win32::{
    Foundation::{COLORREF, HWND, LPARAM, LRESULT, RECT, WPARAM},
    Graphics::Gdi::{
        DrawTextW, FillRect, GetStockObject, OffsetRect, RestoreDC, SaveDC, SetBkMode,
        SetDCBrushColor, SetTextColor, DC_BRUSH, DT_CENTER, DT_HIDEPREFIX, DT_SINGLELINE,
        DT_VCENTER, HBRUSH, HDC, TRANSPARENT,
    },
    UI::{
        Controls::{DRAWITEMSTRUCT, ODS_DISABLED, ODS_GRAYED, ODS_HOTLIGHT, ODS_NOACCEL, ODS_SELECTED},
        Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
        WindowsAndMessaging::{
            DrawMenuBar, GetMenuBarInfo, GetMenuItemInfoW, GetWindowRect, HMENU, MENUBARINFO,
            MENUITEMINFOW, MIIM_STRING, OBJID_MENU, WM_NCDESTROY,
        },
    },
};

const fn rgb(red: u8, green: u8, blue: u8) -> COLORREF {
    COLORREF(red as u32 | ((green as u32) << 8) | ((blue as u32) << 16))
}

const BACKGROUND: COLORREF = rgb(0xE3, 0xF2, 0xFD);
const HIGHLIGHT: COLORREF = rgb(0xBB, 0xDE, 0xFB);
const TEXT: COLORREF = rgb(0x24, 0x36, 0x4B);

// The native menu used by Tauri (muda) receives these UAH paint messages.
// Only the leading fields used for drawing are needed from the item payload.
const WM_UAHDRAWMENU: u32 = 0x0091;
const WM_UAHDRAWMENUITEM: u32 = 0x0092;

#[repr(C)]
struct MenuPaint {
    menu: HMENU,
    dc: HDC,
    flags: u32,
}

#[repr(C)]
struct ItemPaint {
    draw: DRAWITEMSTRUCT,
    menu: MenuPaint,
    position: u32,
}

pub(super) fn install(hwnd: HWND) {
    // Called on the window's UI thread after Tauri has attached its menu.
    unsafe {
        if SetWindowSubclass(hwnd, Some(menu_proc), 1, 0).as_bool() {
            let _ = DrawMenuBar(hwnd);
        }
    }
}

unsafe extern "system" fn menu_proc(
    hwnd: HWND, msg: u32, wparam: WPARAM, lparam: LPARAM, id: usize, _data: usize,
) -> LRESULT {
    match msg {
        WM_UAHDRAWMENU if lparam.0 != 0 => {
            let paint = &*(lparam.0 as *const MenuPaint);
            let mut bar = MENUBARINFO {
                cbSize: size_of::<MENUBARINFO>() as u32,
                ..Default::default()
            };
            let mut window = RECT::default();
            if GetMenuBarInfo(hwnd, OBJID_MENU, 0, &mut bar).is_ok()
                && GetWindowRect(hwnd, &mut window).is_ok()
            {
                let _ = OffsetRect(&mut bar.rcBar, -window.left, -window.top);
                if fill(paint.dc, &bar.rcBar, BACKGROUND) {
                    return LRESULT(0);
                }
            }
        }
        WM_UAHDRAWMENUITEM if lparam.0 != 0 => {
            if draw_item(&*(lparam.0 as *const ItemPaint)) {
                return LRESULT(0);
            }
        }
        WM_NCDESTROY => {
            let _ = RemoveWindowSubclass(hwnd, Some(menu_proc), id);
        }
        _ => {}
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

unsafe fn fill(dc: HDC, rect: &RECT, color: COLORREF) -> bool {
    let previous = SetDCBrushColor(dc, color);
    let brush = HBRUSH(GetStockObject(DC_BRUSH).0);
    let painted = FillRect(dc, rect, brush) != 0;
    SetDCBrushColor(dc, previous);
    painted
}

unsafe fn draw_item(paint: &ItemPaint) -> bool {
    let mut label = [0u16; 128];
    let mut info = MENUITEMINFOW {
        cbSize: size_of::<MENUITEMINFOW>() as u32,
        fMask: MIIM_STRING,
        dwTypeData: PWSTR(label.as_mut_ptr()),
        cch: label.len() as u32,
        ..Default::default()
    };
    if GetMenuItemInfoW(paint.menu.menu, paint.position, true.into(), &mut info).is_err()
        || info.cch == 0 || info.cch as usize >= label.len() - 1
    {
        return false;
    }
    let state = paint.draw.itemState;
    if state.0 & (ODS_DISABLED.0 | ODS_GRAYED.0) != 0 {
        return false;
    }
    let background = if state.0 & (ODS_HOTLIGHT.0 | ODS_SELECTED.0) != 0 {
        HIGHLIGHT
    } else {
        BACKGROUND
    };
    let mut format = DT_CENTER | DT_SINGLELINE | DT_VCENTER;
    if state.0 & ODS_NOACCEL.0 != 0 {
        format |= DT_HIDEPREFIX;
    }
    let dc = paint.menu.dc;
    let saved = SaveDC(dc);
    if saved == 0 {
        return false;
    }
    let mut rect = paint.draw.rcItem;
    let painted = fill(dc, &rect, background);
    SetBkMode(dc, TRANSPARENT);
    SetTextColor(dc, TEXT);
    let drawn = DrawTextW(dc, &mut label[..info.cch as usize], &mut rect, format);
    let _ = RestoreDC(dc, saved);
    painted && drawn != 0
}
