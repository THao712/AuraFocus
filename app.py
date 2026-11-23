import base64
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time

import webview

import win32_native


def get_asset_path(relative_path):
    base = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
    return base / relative_path


def get_data_dir():
    override = os.environ.get('AURAFOCUS_DATA_DIR')
    if override:
        return Path(override).resolve()
    return Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'AuraFocus'


class StateStore:
    """Keep data independent of WebView origins and EXE extraction paths."""

    def __init__(self, directory):
        self.path = Path(directory) / 'state.json'
        self.lock = threading.Lock()

    def load(self):
        with self.lock:
            if not self.path.exists():
                return None
            try:
                state = json.loads(self.path.read_text(encoding='utf-8'))
                if not isinstance(state, dict):
                    raise ValueError('State must be an object')
                return state
            except (ValueError, UnicodeError):
                backup = self.path.with_name(f'state.corrupt-{time.time_ns()}.json')
                self.path.replace(backup)
                return None

    def save(self, state):
        if not isinstance(state, dict) or state.get('version') not in (2, 3):
            raise ValueError('Unsupported state format')
        payload = json.dumps(state, ensure_ascii=False, allow_nan=False, indent=2)
        with self.lock:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            temporary = None
            try:
                with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8',
                                                 dir=self.path.parent, prefix='state-',
                                                 suffix='.tmp', delete=False) as stream:
                    temporary = Path(stream.name)
                    stream.write(payload)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temporary, self.path)
            finally:
                if temporary is not None:
                    temporary.unlink(missing_ok=True)


class RECT(ctypes.Structure):
    _fields_ = [('left', wintypes.LONG), ('top', wintypes.LONG),
                ('right', wintypes.LONG), ('bottom', wintypes.LONG)]


class MONITORINFO(ctypes.Structure):
    _fields_ = [('cbSize', wintypes.DWORD), ('rcMonitor', RECT),
                ('rcWork', RECT), ('dwFlags', wintypes.DWORD)]


# Isolated signatures: do not mutate pywebview's ctypes.windll functions.
_user32 = ctypes.WinDLL('user32', use_last_error=True)
_user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int,
                               ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
_user32.SetWindowPos.restype = wintypes.BOOL
_user32.GetWindowRect.argtypes = [wintypes.HWND, ctypes.POINTER(RECT)]
_user32.GetWindowRect.restype = wintypes.BOOL
_user32.GetCursorPos.argtypes = [ctypes.POINTER(wintypes.POINT)]
_user32.GetCursorPos.restype = wintypes.BOOL
_user32.MonitorFromRect.argtypes = [ctypes.POINTER(RECT), wintypes.DWORD]
_user32.MonitorFromRect.restype = wintypes.HANDLE
_user32.GetMonitorInfoW.argtypes = [wintypes.HANDLE, ctypes.POINTER(MONITORINFO)]
_user32.GetMonitorInfoW.restype = wintypes.BOOL

SWP_NOSIZE = 0x0001
SWP_NOMOVE = 0x0002
SWP_NOZORDER = 0x0004
SWP_NOACTIVATE = 0x0010


def fit_position(rect, work, threshold=0):
    """Clamp/snap physical coordinates, including negative monitor origins."""
    left, top, right, bottom = work
    width, height = rect.right - rect.left, rect.bottom - rect.top
    x = max(left, min(right - width, rect.left))
    y = max(top, min(bottom - height, rect.top))
    if threshold:
        if abs(x - left) <= threshold:
            x = left
        elif abs(x + width - right) <= threshold:
            x = max(left, right - width)
        if abs(y - top) <= threshold:
            y = top
        elif abs(y + height - bottom) <= threshold:
            y = max(top, bottom - height)
    return x, y


def resolve_initial_position(saved_state, screens):
    screen = screens[0] if screens else None
    default_x = screen.x + max(0, screen.width - 340) if screen else 100
    default_y = screen.y + 50 if screen else 50
    if not isinstance(saved_state, dict):
        return default_x, default_y
    win = saved_state.get('window')
    if not isinstance(win, dict):
        return default_x, default_y
    x, y = win.get('x'), win.get('y')
    if not (isinstance(x, int) and not isinstance(x, bool) and isinstance(y, int) and not isinstance(y, bool)):
        return default_x, default_y
    if not screens:
        return x, y
    best = min(
        screens,
        key=lambda s: max(0, s.x - x, x - (s.x + getattr(s, 'width', 1920)))
        + max(0, s.y - y, y - (s.y + getattr(s, 'height', 1080))),
    )
    sw = getattr(best, 'width', 1920)
    sh = getattr(best, 'height', 1080)
    return fit_position(RECT(x, y, x + 290, y + 68), (best.x, best.y, best.x + sw, best.y + sh), 0)


class BridgeApi:
    def __init__(self, data_dir=None):
        self._window = None
        self._window_lock = threading.RLock()
        self._drag_origin = None
        self._mode = 'capsule'
        self._store = StateStore(data_dir or get_data_dir())
        self._native_ctrl = None

    def set_window(self, window):
        self._window = window

    def start_native_services(self, icon_path=None):
        if self._native_ctrl is None:
            self._native_ctrl = win32_native.Win32NativeController(self, icon_path=icon_path)
            self._native_ctrl.start()

    def shutdown(self):
        if self._native_ctrl is not None:
            self._native_ctrl.stop()
            self._native_ctrl = None

    def load_state(self):
        try:
            return {'status': 'ok', 'state': self._store.load()}
        except OSError as exc:
            return {'status': 'error', 'message': str(exc)}

    def save_state(self, state):
        try:
            self._store.save(state)
            return {'status': 'ok'}
        except (OSError, ValueError, TypeError) as exc:
            return {'status': 'error', 'message': str(exc)}

    def _hwnd(self):
        if self._window is None:
            raise RuntimeError('Window not initialized')
        return wintypes.HWND(int(self._window.native.Handle.ToInt64()))

    def try_hwnd(self):
        try:
            return self._hwnd()
        except Exception:
            return None

    def is_dragging(self):
        return self._drag_origin is not None

    def current_window_mode(self):
        return self._mode

    def _rect(self):
        rect = RECT()
        if not _user32.GetWindowRect(self._hwnd(), ctypes.byref(rect)):
            raise ctypes.WinError(ctypes.get_last_error())
        return rect

    def _cursor(self):
        point = wintypes.POINT()
        if not _user32.GetCursorPos(ctypes.byref(point)):
            raise ctypes.WinError(ctypes.get_last_error())
        return point.x, point.y

    def _get_work_area(self, rect):
        monitor = _user32.MonitorFromRect(ctypes.byref(rect), 2)
        info = MONITORINFO()
        info.cbSize = ctypes.sizeof(info)
        if not _user32.GetMonitorInfoW(monitor, ctypes.byref(info)):
            raise ctypes.WinError(ctypes.get_last_error())
        work = info.rcWork
        return work.left, work.top, work.right, work.bottom

    def _move(self, x, y):
        if not _user32.SetWindowPos(self._hwnd(), None, x, y, 0, 0,
                                   SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE):
            raise ctypes.WinError(ctypes.get_last_error())

    def begin_drag(self):
        with self._window_lock:
            rect = self._rect()
            self._drag_origin = (*self._cursor(), rect.left, rect.top)
        return {'status': 'ok'}

    def drag_to(self):
        # Current native cursor avoids stale requests and mixed-DPI conversion.
        with self._window_lock:
            if self._drag_origin is not None:
                cursor_x, cursor_y = self._cursor()
                start_x, start_y, window_x, window_y = self._drag_origin
                self._move(window_x + cursor_x - start_x, window_y + cursor_y - start_y)
        return {'status': 'ok'}

    def end_drag(self, auto_snap=True):
        with self._window_lock:
            self.drag_to()
            self._drag_origin = None
            return self.snap_window(45 if auto_snap else 0)

    def snap_window(self, threshold=45):
        with self._window_lock:
            rect = self._rect()
            x, y = fit_position(rect, self._get_work_area(rect), max(0, min(100, threshold)))
            changed = (x, y) != (rect.left, rect.top)
            if changed:
                self._move(x, y)
        return {'status': 'ok', 'snapped': changed, 'x': x, 'y': y}

    def toggle_size(self, mode):
        if mode not in ('expanded', 'capsule', 'peek'):
            raise ValueError('Unknown window mode')
        with self._window_lock:
            self._mode = mode
            sizes = {'expanded': (400, 640), 'capsule': (290, 68), 'peek': (20, 68)}
            self._window.resize(*sizes[mode])
            self.snap_window(0)
        return {'status': 'ok', 'mode': mode}

    def apply_peek_window(self, entering, geom):
        with self._window_lock:
            hwnd = self.try_hwnd()
            if not hwnd:
                return
            if entering:
                self._mode = 'peek'
                _user32.SetWindowPos(
                    hwnd, None, geom['peek_x'], geom['peek_y'],
                    geom['peek_w'], geom['peek_h'],
                    SWP_NOZORDER | SWP_NOACTIVATE
                )
            else:
                self._mode = 'capsule'
                _user32.SetWindowPos(
                    hwnd, None, geom['restore_x'], geom['restore_y'],
                    geom['restore_w'], geom['restore_h'],
                    SWP_NOZORDER | SWP_NOACTIVATE
                )
        self.dispatch_frontend_event('peek_state', {'peek': bool(entering)})

    def dispatch_frontend_event(self, name, payload=None):
        if self._window is None:
            return
        script = f'window.app && window.app.handleNativeEvent({json.dumps(name)}, {json.dumps(payload or {})})'
        try:
            self._window.evaluate_js(script)
        except Exception:
            pass

    def configure_native(self, config):
        if self._native_ctrl is not None:
            self._native_ctrl.update_config(config)
        return {'status': 'ok'}

    def allow_distraction_temp(self, seconds=180):
        if self._native_ctrl is not None:
            self._native_ctrl.allow_temp(seconds)
        return {'status': 'ok'}

    def hide_to_tray(self):
        if self._native_ctrl is not None:
            self._native_ctrl.hide_main_window()
        return {'status': 'ok'}

    def open_system_dnd(self):
        try:
            win32_native.open_system_dnd()
            return {'status': 'ok'}
        except OSError as exc:
            return {'status': 'error', 'message': str(exc)}

    def copy_text(self, text):
        try:
            win32_native.copy_unicode_clipboard(text)
            return {'status': 'ok'}
        except OSError as exc:
            return {'status': 'error', 'message': str(exc)}

    def save_png(self, data_url, default_name='AuraFocus-receipt.png'):
        try:
            prefix = 'data:image/png;base64,'
            if not isinstance(data_url, str) or not data_url.startswith(prefix):
                raise ValueError('Invalid PNG data URL')
            raw = base64.b64decode(data_url[len(prefix):], validate=True)
            dialog_type = getattr(getattr(webview, 'FileDialog', None), 'SAVE', getattr(webview, 'SAVE_DIALOG', 20))
            selection = self._window.create_file_dialog(
                dialog_type,
                save_filename=default_name,
                file_types=('PNG Image (*.png)',),
            )
            if not selection:
                return {'status': 'cancelled'}
            target_path = Path(selection[0] if isinstance(selection, (list, tuple)) else selection)
            if target_path.suffix.lower() != '.png':
                target_path = target_path.with_suffix('.png')
            target_path.write_bytes(raw)
            return {'status': 'ok', 'path': str(target_path)}
        except Exception as exc:
            return {'status': 'error', 'message': str(exc)}

    def set_on_top(self, on_top):
        with self._window_lock:
            target = wintypes.HWND(-1 if on_top else -2)
            if not _user32.SetWindowPos(self._hwnd(), target, 0, 0, 0, 0,
                                       SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE):
                raise ctypes.WinError(ctypes.get_last_error())
        return {'status': 'ok', 'on_top': bool(on_top)}

    def close(self):
        def close_after_reply():
            time.sleep(0.05)
            self.shutdown()
            if self._window is not None:
                self._window.destroy()
        threading.Thread(target=close_after_reply, daemon=True).start()
        return {'status': 'ok'}


def main():
    api = BridgeApi()
    screens = webview.screens
    saved = None
    try:
        saved = api._store.load()
    except OSError:
        saved = None
    init_x, init_y = resolve_initial_position(saved, screens)
    window = webview.create_window(
        title='AuraFocus - 口袋专注机',
        url=get_asset_path('ui/index.html').resolve().as_uri(),
        js_api=api,
        width=290,
        height=68,
        min_size=(20, 68),
        x=init_x,
        y=init_y,
        frameless=True,
        easy_drag=False,
        resizable=False,
        transparent=False,
        background_color='#dce0d6',
        on_top=True,
    )
    api.set_window(window)
    if hasattr(window, 'events') and hasattr(window.events, 'closed'):
        window.events.closed += api.shutdown
    if os.environ.get('AURAFOCUS_DISABLE_TRAY') != '1' and hasattr(window, 'events'):
        api.start_native_services(icon_path=get_asset_path('ui/icon.ico'))
    try:
        webview.start(debug=False, private_mode=False, storage_path=str(get_data_dir() / 'webview'))
    finally:
        api.shutdown()


if __name__ == '__main__':
    main()
