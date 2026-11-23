"""Pure Win32 ctypes helpers for AuraFocus v2 (zero external dependencies).

Provides:
- Focus Guard foreground window matcher & stateful debounced tracker
- Edge peek geometry & layered window opacity helpers
- Background Win32 message window hosting global hotkeys and system tray icon
- Win32 Unicode clipboard helper & Windows Focus Assist launcher
"""
import ctypes
from ctypes import wintypes
import os
from pathlib import Path
import threading
import time

LRESULT = ctypes.c_ssize_t
WPARAM = ctypes.c_size_t
LPARAM = ctypes.c_ssize_t
ULONG_PTR = ctypes.c_size_t

_user32 = ctypes.WinDLL('user32', use_last_error=True)
_kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
_shell32 = ctypes.WinDLL('shell32', use_last_error=True)

# Constants
GWL_EXSTYLE = -20
WS_EX_LAYERED = 0x00080000
LWA_ALPHA = 0x00000002

SW_HIDE = 0
SW_SHOW = 5
SW_RESTORE = 9

WM_NULL = 0x0000
WM_DESTROY = 0x0002
WM_CLOSE = 0x0010
WM_COMMAND = 0x0111
WM_TIMER = 0x0113
WM_HOTKEY = 0x0312
WM_APP = 0x8000
WM_TRAYICON = WM_APP + 1
WM_SYNC_HOTKEYS = WM_APP + 2

WM_LBUTTONUP = 0x0202
WM_LBUTTONDBLCLK = 0x0203
WM_RBUTTONUP = 0x0205

MOD_ALT = 0x0001
MOD_SHIFT = 0x0004
MOD_NOREPEAT = 0x4000

NIM_ADD = 0x00000000
NIM_MODIFY = 0x00000001
NIM_DELETE = 0x00000002
NIF_MESSAGE = 0x00000001
NIF_ICON = 0x00000002
NIF_TIP = 0x00000004

IMAGE_ICON = 1
LR_LOADFROMFILE = 0x0010
LR_DEFAULTSIZE = 0x0040
IDI_APPLICATION = 32512

MF_STRING = 0x0000
MF_SEPARATOR = 0x0800
TPM_RIGHTBUTTON = 0x0002
TPM_NONOTIFY = 0x0080
TPM_RETURNCMD = 0x0100

PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
CF_UNICODETEXT = 13
GMEM_MOVEABLE = 0x0002

MENU_SHOW = 1001
MENU_TOGGLE = 1002
MENU_MUTE = 1003
MENU_EXIT = 1004

HOTKEY_MAP = {
    1: ('hotkey_toggle', MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 0x20),  # Alt+Shift+Space
    2: ('hotkey_expand', MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 0x46),  # Alt+Shift+F
    3: ('hotkey_park', MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 0x4E),    # Alt+Shift+N
    4: ('hotkey_mute', MOD_ALT | MOD_SHIFT | MOD_NOREPEAT, 0x4D),    # Alt+Shift+M
}

WNDPROC = ctypes.WINFUNCTYPE(LRESULT, wintypes.HWND, wintypes.UINT, WPARAM, LPARAM)


class WNDCLASSW(ctypes.Structure):
    _fields_ = [
        ('style', wintypes.UINT),
        ('lpfnWndProc', WNDPROC),
        ('cbClsExtra', ctypes.c_int),
        ('cbWndExtra', ctypes.c_int),
        ('hInstance', wintypes.HINSTANCE),
        ('hIcon', wintypes.HICON),
        ('hCursor', wintypes.HANDLE),
        ('hbrBackground', wintypes.HBRUSH),
        ('lpszMenuName', wintypes.LPCWSTR),
        ('lpszClassName', wintypes.LPCWSTR),
    ]


class NOTIFYICONDATAW(ctypes.Structure):
    _fields_ = [
        ('cbSize', wintypes.DWORD),
        ('hWnd', wintypes.HWND),
        ('uID', wintypes.UINT),
        ('uFlags', wintypes.UINT),
        ('uCallbackMessage', wintypes.UINT),
        ('hIcon', wintypes.HICON),
        ('szTip', wintypes.WCHAR * 128),
        ('dwState', wintypes.DWORD),
        ('dwStateMask', wintypes.DWORD),
        ('szInfo', wintypes.WCHAR * 256),
        ('uVersion', wintypes.UINT),
        ('szInfoTitle', wintypes.WCHAR * 64),
        ('dwInfoFlags', wintypes.DWORD),
    ]


# Explicit Win32 function prototypes (64-bit safe)
_user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
_user32.GetWindowLongW.restype = wintypes.LONG
_user32.SetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.LONG]
_user32.SetWindowLongW.restype = wintypes.LONG
_user32.SetLayeredWindowAttributes.argtypes = [wintypes.HWND, wintypes.COLORREF, wintypes.BYTE, wintypes.DWORD]
_user32.SetLayeredWindowAttributes.restype = wintypes.BOOL
_user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
_user32.ShowWindow.restype = wintypes.BOOL
_user32.IsWindowVisible.argtypes = [wintypes.HWND]
_user32.IsWindowVisible.restype = wintypes.BOOL
_user32.SetForegroundWindow.argtypes = [wintypes.HWND]
_user32.SetForegroundWindow.restype = wintypes.BOOL
_user32.GetForegroundWindow.argtypes = []
_user32.GetForegroundWindow.restype = wintypes.HWND
_user32.GetWindowTextLengthW.argtypes = [wintypes.HWND]
_user32.GetWindowTextLengthW.restype = ctypes.c_int
_user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
_user32.GetWindowTextW.restype = ctypes.c_int
_user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.DWORD)]
_user32.GetWindowThreadProcessId.restype = wintypes.DWORD
_user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
_user32.GetCursorPos.restype = wintypes.BOOL

_user32.RegisterClassW.argtypes = [ctypes.POINTER(WNDCLASSW)]
_user32.RegisterClassW.restype = wintypes.ATOM
_user32.UnregisterClassW.argtypes = [wintypes.LPCWSTR, wintypes.HINSTANCE]
_user32.UnregisterClassW.restype = wintypes.BOOL
_user32.CreateWindowExW.argtypes = [
    wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR, wintypes.DWORD,
    ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int,
    wintypes.HWND, wintypes.HMENU, wintypes.HINSTANCE, wintypes.LPVOID
]
_user32.CreateWindowExW.restype = wintypes.HWND
_user32.DestroyWindow.argtypes = [wintypes.HWND]
_user32.DestroyWindow.restype = wintypes.BOOL
_user32.DefWindowProcW.argtypes = [wintypes.HWND, wintypes.UINT, WPARAM, LPARAM]
_user32.DefWindowProcW.restype = LRESULT
_user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT]
_user32.GetMessageW.restype = wintypes.BOOL
_user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
_user32.TranslateMessage.restype = wintypes.BOOL
_user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
_user32.DispatchMessageW.restype = LRESULT
_user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, WPARAM, LPARAM]
_user32.PostMessageW.restype = wintypes.BOOL
_user32.PostQuitMessage.argtypes = [ctypes.c_int]
_user32.PostQuitMessage.restype = None
_user32.SetTimer.argtypes = [wintypes.HWND, ULONG_PTR, wintypes.UINT, wintypes.LPVOID]
_user32.SetTimer.restype = ULONG_PTR
_user32.KillTimer.argtypes = [wintypes.HWND, ULONG_PTR]
_user32.KillTimer.restype = wintypes.BOOL
_user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, wintypes.UINT, wintypes.UINT]
_user32.RegisterHotKey.restype = wintypes.BOOL
_user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
_user32.UnregisterHotKey.restype = wintypes.BOOL
_user32.LoadImageW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR, wintypes.UINT, ctypes.c_int, ctypes.c_int, wintypes.UINT]
_user32.LoadImageW.restype = wintypes.HANDLE
_user32.LoadIconW.argtypes = [wintypes.HINSTANCE, wintypes.LPCWSTR]
_user32.LoadIconW.restype = wintypes.HICON
_user32.DestroyIcon.argtypes = [wintypes.HICON]
_user32.DestroyIcon.restype = wintypes.BOOL
_user32.CreatePopupMenu.argtypes = []
_user32.CreatePopupMenu.restype = wintypes.HMENU
_user32.AppendMenuW.argtypes = [wintypes.HMENU, wintypes.UINT, ULONG_PTR, wintypes.LPCWSTR]
_user32.AppendMenuW.restype = wintypes.BOOL
_user32.TrackPopupMenu.argtypes = [wintypes.HMENU, wintypes.UINT, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.HWND, wintypes.LPVOID]
_user32.TrackPopupMenu.restype = wintypes.BOOL
_user32.DestroyMenu.argtypes = [wintypes.HMENU]
_user32.DestroyMenu.restype = wintypes.BOOL

_user32.OpenClipboard.argtypes = [wintypes.HWND]
_user32.OpenClipboard.restype = wintypes.BOOL
_user32.EmptyClipboard.argtypes = []
_user32.EmptyClipboard.restype = wintypes.BOOL
_user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
_user32.SetClipboardData.restype = wintypes.HANDLE
_user32.CloseClipboard.argtypes = []
_user32.CloseClipboard.restype = wintypes.BOOL

_kernel32.GetModuleHandleW.argtypes = [wintypes.LPCWSTR]
_kernel32.GetModuleHandleW.restype = wintypes.HMODULE
_kernel32.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
_kernel32.OpenProcess.restype = wintypes.HANDLE
_kernel32.CloseHandle.argtypes = [wintypes.HANDLE]
_kernel32.CloseHandle.restype = wintypes.BOOL
_kernel32.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
_kernel32.QueryFullProcessImageNameW.restype = wintypes.BOOL
_kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
_kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
_kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
_kernel32.GlobalLock.restype = ctypes.c_void_p
_kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
_kernel32.GlobalUnlock.restype = wintypes.BOOL
_kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
_kernel32.GlobalFree.restype = wintypes.HGLOBAL

_shell32.Shell_NotifyIconW.argtypes = [wintypes.DWORD, ctypes.POINTER(NOTIFYICONDATAW)]
_shell32.Shell_NotifyIconW.restype = wintypes.BOOL


# ================= PURE LOGIC HELPERS (UNIT TESTABLE) =================

def match_distraction(title, process_name, rules, own_pid=None, current_pid=None):
    """Return matching rule string if foreground window matches blacklist, else None."""
    if own_pid is not None and current_pid == own_pid:
        return None
    if not rules:
        return None
    title_l = (title or '').strip().lower()
    proc_l = (process_name or '').strip().lower()
    if not title_l and not proc_l:
        return None
    proc_stem = proc_l[:-4] if proc_l.endswith('.exe') else proc_l
    if proc_stem in ('explorer', 'shellexperiencehost', 'searchhost', 'startmenuexperiencehost') and not title_l:
        return None

    for rule in rules:
        token = str(rule or '').strip().lower()
        if not token:
            continue
        token_stem = token[:-4] if token.endswith('.exe') else token
        if token in title_l or token in proc_l or (token_stem and token_stem == proc_stem):
            return str(rule).strip()
    return None


class FocusGuardTracker:
    """Debounced local distraction state machine."""

    def __init__(self, own_pid=None):
        self.own_pid = own_pid if own_pid is not None else os.getpid()
        self._streak_start = None
        self._last_nudge_at = 0.0
        self._nudging = False
        self._allow_until = 0.0

    def allow_temp(self, now, seconds=180):
        self._allow_until = now + max(10, seconds)
        self._streak_start = None
        self._nudging = False

    def reset(self):
        self._streak_start = None
        self._nudging = False

    def update(self, now, active, foreground_info, rules, delay_sec=15, strict=False):
        if not active or now < self._allow_until:
            if self._nudging:
                self._nudging = False
                self._streak_start = None
                return {'type': 'clear'}
            self._streak_start = None
            return None

        pid, title, proc = foreground_info
        matched = match_distraction(title, proc, rules, own_pid=self.own_pid, current_pid=pid)
        if not matched:
            self._streak_start = None
            if self._nudging:
                self._nudging = False
                return {'type': 'clear'}
            return None

        if self._streak_start is None:
            self._streak_start = now
            return None

        elapsed = now - self._streak_start
        cooldown = max(45.0, float(delay_sec) * 3.0)
        if elapsed >= float(delay_sec) and (not self._nudging or (now - self._last_nudge_at) >= cooldown):
            self._nudging = True
            self._last_nudge_at = now
            return {'type': 'nudge', 'matched': matched, 'title': title, 'strict': bool(strict)}
        return None


def compute_peek_geometry(rect, work, peek_width=20, edge_margin=16):
    """If window rect hugs left or right work-area border, compute docked peek coordinates."""
    left, top, right, bottom = work
    width = rect.right - rect.left
    height = rect.bottom - rect.top
    if rect.left <= left + edge_margin:
        return {
            'side': 'left',
            'peek_x': left,
            'peek_y': rect.top,
            'peek_w': peek_width,
            'peek_h': height,
            'restore_x': left,
            'restore_y': rect.top,
            'restore_w': width,
            'restore_h': height,
        }
    if rect.right >= right - edge_margin:
        return {
            'side': 'right',
            'peek_x': right - peek_width,
            'peek_y': rect.top,
            'peek_w': peek_width,
            'peek_h': height,
            'restore_x': right - width,
            'restore_y': rect.top,
            'restore_w': width,
            'restore_h': height,
        }
    return None


# ================= DIRECT WIN32 RUNTIME UTILITIES =================

def set_window_alpha(hwnd, alpha=255):
    """Set layered window opacity (0-255)."""
    alpha = max(40, min(255, int(alpha)))
    ex_style = _user32.GetWindowLongW(hwnd, GWL_EXSTYLE)
    if not (ex_style & WS_EX_LAYERED):
        _user32.SetWindowLongW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED)
    _user32.SetLayeredWindowAttributes(hwnd, 0, alpha, LWA_ALPHA)


def get_foreground_info():
    """Return (pid, window_title, process_basename) for the active foreground window."""
    hwnd = _user32.GetForegroundWindow()
    if not hwnd:
        return (0, '', '')
    pid = wintypes.DWORD(0)
    _user32.GetWindowThreadProcessId(hwnd, ctypes.byref(pid))
    length = _user32.GetWindowTextLengthW(hwnd)
    title = ''
    if length > 0:
        buf = ctypes.create_unicode_buffer(min(length + 1, 512))
        _user32.GetWindowTextW(hwnd, buf, len(buf))
        title = buf.value
    proc_name = ''
    if pid.value:
        handle = _kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid.value)
        if handle:
            try:
                size = wintypes.DWORD(512)
                buf = ctypes.create_unicode_buffer(size.value)
                if _kernel32.QueryFullProcessImageNameW(handle, 0, buf, ctypes.byref(size)):
                    proc_name = os.path.basename(buf.value)
            finally:
                _kernel32.CloseHandle(handle)
    return (pid.value, title, proc_name)


def open_system_dnd():
    """Open Windows Focus Assist / Do Not Disturb settings page."""
    os.startfile('ms-settings:quiethours')


def copy_unicode_clipboard(text):
    """Copy UTF-16 text directly to Windows clipboard (works offline without HTTPS)."""
    raw = (str(text) + '\x00').encode('utf-16-le')
    if not _user32.OpenClipboard(None):
        raise ctypes.WinError(ctypes.get_last_error())
    try:
        _user32.EmptyClipboard()
        handle = _kernel32.GlobalAlloc(GMEM_MOVEABLE, len(raw))
        if not handle:
            raise ctypes.WinError(ctypes.get_last_error())
        ptr = _kernel32.GlobalLock(handle)
        if not ptr:
            _kernel32.GlobalFree(handle)
            raise ctypes.WinError(ctypes.get_last_error())
        try:
            ctypes.memmove(ptr, raw, len(raw))
        finally:
            _kernel32.GlobalUnlock(handle)
        if not _user32.SetClipboardData(CF_UNICODETEXT, handle):
            _kernel32.GlobalFree(handle)
            raise ctypes.WinError(ctypes.get_last_error())
    finally:
        _user32.CloseClipboard()


# ================= BACKGROUND WIN32 CONTROLLER =================

class Win32NativeController:
    """Runs global hotkeys, system tray icon, focus guard, hover fade and edge peek."""

    def __init__(self, api, icon_path=None):
        self._api = api
        self._icon_path = Path(icon_path) if icon_path else None
        self._thread = None
        self._msg_hwnd = None
        self._class_name = f'AuraFocusNative_{os.getpid()}_{id(self)}'
        self._hinstance = _kernel32.GetModuleHandleW(None)
        self._hicon = None
        self._own_icon = False
        self._tray_added = False
        self._registered_hotkeys = set()
        self._wndproc = WNDPROC(self._window_proc)
        self._stop_event = threading.Event()

        self._lock = threading.RLock()
        self._config = {
            'hoverFade': False,
            'edgePeek': False,
            'closeToTray': True,
            'hotkeysEnabled': False,
            'focusGuardEnabled': False,
            'focusGuardStrict': False,
            'focusGuardDelaySec': 15,
            'focusGuardRules': [],
            'focusActive': False,
            'task': '',
        }
        self._tracker = FocusGuardTracker(own_pid=os.getpid())
        self._last_guard_poll = 0.0
        self._current_alpha = 255
        self._hover_left_at = None
        self._peek_restore = None

    def start(self):
        if self._thread and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run_loop, name='AuraFocusWin32', daemon=True)
        self._thread.start()

    def stop(self):
        self._stop_event.set()
        hwnd = self._msg_hwnd
        if hwnd:
            _user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=2.0)

    def update_config(self, config):
        with self._lock:
            was_focus = self._config.get('focusActive', False)
            self._config.update(config or {})
            if not self._config.get('focusActive', False) and was_focus:
                self._tracker.reset()
        if self._msg_hwnd:
            _user32.PostMessageW(self._msg_hwnd, WM_SYNC_HOTKEYS, 0, 0)
        if not self._config.get('hoverFade'):
            self._apply_alpha(255)
        if not self._config.get('edgePeek') and self._peek_restore is not None:
            self._restore_from_peek()

    def allow_temp(self, seconds=180):
        with self._lock:
            self._tracker.allow_temp(time.monotonic(), seconds)

    def show_main_window(self):
        hwnd = self._api.try_hwnd()
        if not hwnd:
            return
        if self._peek_restore is not None:
            self._restore_from_peek()
        _user32.ShowWindow(hwnd, SW_SHOW)
        _user32.ShowWindow(hwnd, SW_RESTORE)
        _user32.SetForegroundWindow(hwnd)
        self._apply_alpha(255)

    def hide_main_window(self):
        hwnd = self._api.try_hwnd()
        if not hwnd:
            return
        _user32.ShowWindow(hwnd, SW_HIDE)

    def toggle_main_visibility(self):
        hwnd = self._api.try_hwnd()
        if not hwnd:
            return
        if _user32.IsWindowVisible(hwnd):
            self.hide_main_window()
        else:
            self.show_main_window()

    def _apply_alpha(self, alpha):
        if alpha == self._current_alpha:
            return
        hwnd = self._api.try_hwnd()
        if not hwnd:
            return
        try:
            set_window_alpha(hwnd, alpha)
            self._current_alpha = alpha
        except OSError:
            pass

    def _sync_hotkeys(self):
        if not self._msg_hwnd:
            return
        with self._lock:
            enabled = bool(self._config.get('hotkeysEnabled', False))
        if enabled:
            for hk_id, (_, mods, vk) in HOTKEY_MAP.items():
                if hk_id not in self._registered_hotkeys:
                    if _user32.RegisterHotKey(self._msg_hwnd, hk_id, mods, vk):
                        self._registered_hotkeys.add(hk_id)
        else:
            for hk_id in list(self._registered_hotkeys):
                _user32.UnregisterHotKey(self._msg_hwnd, hk_id)
                self._registered_hotkeys.discard(hk_id)

    def _add_tray_icon(self):
        if not self._msg_hwnd or self._tray_added:
            return
        hicon = None
        if self._icon_path and self._icon_path.exists():
            hicon = _user32.LoadImageW(None, str(self._icon_path), IMAGE_ICON, 16, 16, LR_LOADFROMFILE)
            if hicon:
                self._own_icon = True
        if not hicon:
            hicon = _user32.LoadIconW(None, ctypes.cast(IDI_APPLICATION, wintypes.LPCWSTR))
            self._own_icon = False
        self._hicon = hicon

        nid = NOTIFYICONDATAW()
        nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
        nid.hWnd = self._msg_hwnd
        nid.uID = 1
        nid.uFlags = NIF_MESSAGE | NIF_ICON | NIF_TIP
        nid.uCallbackMessage = WM_TRAYICON
        nid.hIcon = hicon
        nid.szTip = 'AuraFocus - 口袋专注机'
        if _shell32.Shell_NotifyIconW(NIM_ADD, ctypes.byref(nid)):
            self._tray_added = True

    def _remove_tray_icon(self):
        if self._tray_added and self._msg_hwnd:
            nid = NOTIFYICONDATAW()
            nid.cbSize = ctypes.sizeof(NOTIFYICONDATAW)
            nid.hWnd = self._msg_hwnd
            nid.uID = 1
            _shell32.Shell_NotifyIconW(NIM_DELETE, ctypes.byref(nid))
            self._tray_added = False
        if self._own_icon and self._hicon:
            _user32.DestroyIcon(self._hicon)
            self._hicon = None
            self._own_icon = False

    def _show_tray_menu(self):
        menu = _user32.CreatePopupMenu()
        if not menu:
            return
        try:
            _user32.AppendMenuW(menu, MF_STRING, MENU_SHOW, '显示 / 隐藏 AuraFocus')
            _user32.AppendMenuW(menu, MF_STRING, MENU_TOGGLE, '开始 / 暂停专注')
            _user32.AppendMenuW(menu, MF_STRING, MENU_MUTE, '静音 / 恢复环境音')
            _user32.AppendMenuW(menu, MF_SEPARATOR, 0, None)
            _user32.AppendMenuW(menu, MF_STRING, MENU_EXIT, '退出 AuraFocus')

            pt = wintypes.POINT()
            _user32.GetCursorPos(ctypes.byref(pt))
            _user32.SetForegroundWindow(self._msg_hwnd)
            cmd = _user32.TrackPopupMenu(
                menu,
                TPM_RIGHTBUTTON | TPM_NONOTIFY | TPM_RETURNCMD,
                pt.x,
                pt.y,
                0,
                self._msg_hwnd,
                None,
            )
            _user32.PostMessageW(self._msg_hwnd, WM_NULL, 0, 0)
            if cmd == MENU_SHOW:
                self.toggle_main_visibility()
            elif cmd == MENU_TOGGLE:
                self._api.dispatch_frontend_event('tray_toggle')
            elif cmd == MENU_MUTE:
                self._api.dispatch_frontend_event('tray_mute')
            elif cmd == MENU_EXIT:
                self._api.dispatch_frontend_event('tray_exit')
        finally:
            _user32.DestroyMenu(menu)

    def _enter_peek(self, geom):
        self._peek_restore = geom
        self._api.apply_peek_window(True, geom)

    def _restore_from_peek(self):
        geom = self._peek_restore
        self._peek_restore = None
        if geom:
            self._api.apply_peek_window(False, geom)

    def _poll_tick(self):
        now = time.monotonic()
        with self._lock:
            cfg = dict(self._config)

        # 1) Focus Guard check (once per second)
        if now - self._last_guard_poll >= 1.0:
            self._last_guard_poll = now
            active = bool(cfg.get('focusActive') and cfg.get('focusGuardEnabled'))
            fg = get_foreground_info() if active else (0, '', '')
            event = self._tracker.update(
                now,
                active,
                fg,
                cfg.get('focusGuardRules') or [],
                delay_sec=cfg.get('focusGuardDelaySec', 15),
                strict=cfg.get('focusGuardStrict', False),
            )
            if event:
                if event.get('type') == 'nudge' and self._peek_restore is not None:
                    self._restore_from_peek()
                if event.get('type') == 'nudge' and event.get('strict'):
                    self.show_main_window()
                self._api.dispatch_frontend_event('focus_guard', event)

        # 2) Hover Fade & Edge Peek (only when capsule mode & visible & not dragging)
        hwnd = self._api.try_hwnd()
        if not hwnd or not _user32.IsWindowVisible(hwnd):
            return
        if self._api.is_dragging():
            self._apply_alpha(255)
            return

        mode = self._api.current_window_mode()
        if mode == 'expanded':
            self._hover_left_at = None
            self._apply_alpha(255)
            return

        try:
            rect = self._api._rect()
            cx, cy = self._api._cursor()
        except OSError:
            return

        inside = (rect.left - 8) <= cx <= (rect.right + 8) and (rect.top - 8) <= cy <= (rect.bottom + 8)
        if inside:
            self._hover_left_at = None
            self._apply_alpha(255)
            if self._peek_restore is not None:
                self._restore_from_peek()
            return

        if self._hover_left_at is None:
            self._hover_left_at = now

        if cfg.get('hoverFade') and (now - self._hover_left_at) >= 0.45:
            self._apply_alpha(150)
        elif not cfg.get('hoverFade'):
            self._apply_alpha(255)

        if cfg.get('edgePeek') and self._peek_restore is None and mode == 'capsule' and (now - self._hover_left_at) >= 0.85:
            try:
                work = self._api._get_work_area(rect)
            except OSError:
                return
            geom = compute_peek_geometry(rect, work, peek_width=20, edge_margin=16)
            if geom:
                self._enter_peek(geom)

    def _window_proc(self, hwnd, msg, wparam, lparam):
        if msg == WM_HOTKEY:
            entry = HOTKEY_MAP.get(int(wparam))
            if entry:
                event_name = entry[0]
                if event_name in ('hotkey_expand', 'hotkey_park'):
                    self.show_main_window()
                self._api.dispatch_frontend_event(event_name)
            return 0
        if msg == WM_SYNC_HOTKEYS:
            self._sync_hotkeys()
            return 0
        if msg == WM_TRAYICON:
            evt = lparam & 0xFFFF
            if evt in (WM_LBUTTONUP, WM_LBUTTONDBLCLK):
                self.show_main_window()
            elif evt == WM_RBUTTONUP:
                self._show_tray_menu()
            return 0
        if msg == WM_TIMER:
            self._poll_tick()
            return 0
        if msg == WM_CLOSE:
            _user32.KillTimer(hwnd, 1)
            for hk_id in list(self._registered_hotkeys):
                _user32.UnregisterHotKey(hwnd, hk_id)
                self._registered_hotkeys.discard(hk_id)
            self._remove_tray_icon()
            _user32.DestroyWindow(hwnd)
            return 0
        if msg == WM_DESTROY:
            _user32.PostQuitMessage(0)
            return 0
        return _user32.DefWindowProcW(hwnd, msg, wparam, lparam)

    def _run_loop(self):
        wc = WNDCLASSW()
        wc.lpfnWndProc = self._wndproc
        wc.hInstance = self._hinstance
        wc.lpszClassName = self._class_name
        atom = _user32.RegisterClassW(ctypes.byref(wc))
        if not atom:
            return
        hwnd = _user32.CreateWindowExW(
            0, self._class_name, 'AuraFocusNativeHost', 0,
            0, 0, 0, 0, None, None, self._hinstance, None
        )
        if not hwnd:
            _user32.UnregisterClassW(self._class_name, self._hinstance)
            return
        self._msg_hwnd = hwnd
        self._add_tray_icon()
        self._sync_hotkeys()
        _user32.SetTimer(hwnd, 1, 220, None)

        msg = wintypes.MSG()
        while not self._stop_event.is_set() and _user32.GetMessageW(ctypes.byref(msg), None, 0, 0) > 0:
            _user32.TranslateMessage(ctypes.byref(msg))
            _user32.DispatchMessageW(ctypes.byref(msg))

        self._msg_hwnd = None
        _user32.UnregisterClassW(self._class_name, self._hinstance)
