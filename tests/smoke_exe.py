"""Verify the built UI and launch/close the EXE using isolated test data."""
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

from PyInstaller.archive.readers import CArchiveReader

ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / 'dist/AuraFocus.exe'
user32 = ctypes.WinDLL('user32')
CALLBACK = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
user32.EnumWindows.argtypes = [CALLBACK, wintypes.LPARAM]
user32.GetWindowTextW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongW.restype = wintypes.LONG
user32.PostMessageW.argtypes = [wintypes.HWND, wintypes.UINT, wintypes.WPARAM, wintypes.LPARAM]
user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]


def windows():
    found = []
    @CALLBACK
    def visit(hwnd, _):
        title = ctypes.create_unicode_buffer(256)
        user32.GetWindowTextW(hwnd, title, len(title))
        if title.value.startswith('AuraFocus - '):
            found.append(hwnd)
        return True
    user32.EnumWindows(visit, 0)
    return set(found)


def main():
    archive = CArchiveReader(str(EXE))
    for name in ('app.js', 'audio.js', 'mascots.js', 'index.html', 'styles.css', 'icon.ico'):
        key = next(key for key in archive.toc if key.replace('\\', '/') == 'ui/' + name)
        assert hashlib.sha256(archive.extract(key)).digest() == hashlib.sha256((ROOT / 'ui' / name).read_bytes()).digest(), name
    print('Packaged UI matches current source.', flush=True)

    with tempfile.TemporaryDirectory(prefix='AuraFocus-exe-test-') as temporary:
        data = Path(temporary)
        state_file = data / 'state.json'
        state_file.write_text(json.dumps({'version': 2,
            'settings': {'volume': 0, 'alwaysOnTop': False},
            'alarms': [], 'stats': {'days': {}}}), encoding='utf-8')
        before = state_file.stat().st_mtime_ns
        existing = windows()
        env = dict(os.environ, AURAFOCUS_DATA_DIR=str(data))
        startup = subprocess.STARTUPINFO()
        startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        startup.wShowWindow = 0
        process = subprocess.Popen([str(EXE)], env=env, startupinfo=startup)
        hwnd = None
        try:
            deadline = time.monotonic() + 35
            while time.monotonic() < deadline:
                new = windows() - existing
                if new:
                    hwnd = next(iter(new))
                    user32.ShowWindow(hwnd, 0)
                if hwnd and state_file.stat().st_mtime_ns != before and not (user32.GetWindowLongW(hwnd, -20) & 8):
                    break
                if process.poll() is not None:
                    raise AssertionError(f'EXE exited early: {process.returncode}')
                time.sleep(0.1)
            else:
                raise AssertionError('EXE did not finish native initialization')
            assert json.loads(state_file.read_text(encoding='utf-8'))['settings']['volume'] == 0
            user32.PostMessageW(hwnd, 0x0010, 0, 0)  # close only the new test window
            process.wait(timeout=15)
            assert process.returncode == 0, process.returncode
            print('Built EXE startup, JSON save, restored native pin and clean exit passed.', flush=True)
        finally:
            if process.poll() is None:
                if hwnd:
                    user32.PostMessageW(hwnd, 0x0010, 0, 0)
                process.wait(timeout=15)


if __name__ == '__main__':
    main()
