"""Real WebView2 smoke check. Uses hidden windows and a temporary data folder."""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def phase(directory, action):
    import app
    import webview

    os.environ['AURAFOCUS_DATA_DIR'] = str(directory / 'data')
    create = webview.create_window
    start = webview.start
    failures = []
    window = None

    def create_hidden(**kwargs):
        nonlocal window
        window = create(**kwargs, hidden=True)
        return window

    def wait_for(expression):
        deadline = time.monotonic() + 25
        while time.monotonic() < deadline:
            if window.evaluate_js(expression):
                return
            time.sleep(0.1)
        raise AssertionError(f'Timed out: {expression}')

    def check():
        try:
            wait_for('!!window.app && !!window.app._nativeInitPromise')
            window.evaluate_js('app._nativeInitPromise.then(() => { window.smokeReady = true; });')
            wait_for('window.smokeReady === true')
            assert window.width == 290 and window.height == 68, (window.width, window.height)

            if action == 'write':
                window.evaluate_js("""
                    app.settings.volume = 0;
                    app.settings.gentleAlarm = false;
                    app.setAlwaysOnTop(false);
                    app.applySettings();
                    app.alarms = [{id: 'smoke', title: '重启验证', time: '23:59',
                      repeat: 'once', enabled: true, nextTriggerAt: Date.now() + 86400000}];
                    app.renderAlarmsList();
                    app.stats.days[app._getTodayStr()] = {minutes: 45, sessions: 1};
                    app.renderStats();
                    app.saveState().then(() => { window.smokeSaved = true; });
                """)
                wait_for('window.smokeSaved === true')

            snapshot = window.evaluate_js("""({
                volume: app.sound.masterVolume,
                slider: Number(document.getElementById('volume-slider').value),
                gentle: app.settings.gentleAlarm,
                pinned: app.settings.alwaysOnTop,
                alarm: app.alarms[0].title,
                today: document.getElementById('stat-today-minutes').textContent,
                bars: document.getElementById('heat-bars-container').children.length,
                resetVisible: document.getElementById('btn-capsule-reset').getBoundingClientRect().right <= innerWidth
            })""")
            assert snapshot == {'volume': 0, 'slider': 0, 'gentle': False, 'pinned': False,
                                'alarm': '重启验证', 'today': '45m', 'bars': 7, 'resetVisible': True}, snapshot
            window.evaluate_js('app._pinSyncChain.then(() => { window.smokePinned = true; });')
            wait_for('window.smokePinned === true')
            user32 = ctypes.WinDLL('user32')
            user32.GetWindowLongW.argtypes = [wintypes.HWND, ctypes.c_int]
            user32.GetWindowLongW.restype = wintypes.LONG
            hwnd = wintypes.HWND(int(window.native.Handle.ToInt64()))
            assert not (user32.GetWindowLongW(hwnd, -20) & 8), 'Native window is still topmost'

            window.evaluate_js("app.switchMode('expanded'); app._windowSyncChain.then(() => {window.smokeExpanded = true;});")
            wait_for('window.smokeExpanded === true')
            assert (window.width, window.height) == (400, 640), (window.width, window.height)
            layout = window.evaluate_js("""(() => {
                const area = document.querySelector('.tab-content-area');
                const results = [];
                const rgb = value => value.match(/[\\d.]+/g).slice(0, 3).map(Number);
                const luminance = value => rgb(value).map(c => {
                    c /= 255; return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
                }).reduce((sum, c, i) => sum + c * [.2126, .7152, .0722][i], 0);
                const contrast = (fg, bg) => {
                    const a = luminance(fg), b = luminance(bg);
                    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
                };
                for (const theme of ['cyber', 'gameboy', 'sunset', 'lavender', 'obsidian', 'phosphor', 'atomic', 'famicom']) {
                    app.applyTheme(theme, false);
                    for (const tab of ['focus', 'alarms', 'stats', 'settings']) {
                        app.switchTab(tab);
                        area.scrollTop = 0;
                        results.push({theme, tab, horizontal: area.scrollWidth - area.clientWidth,
                            vertical: area.scrollHeight - area.clientHeight});
                    }
                    const base = getComputedStyle(document.body);
                    const hint = getComputedStyle(document.querySelector('.settings-desc'));
                    const primary = getComputedStyle(document.getElementById('btn-add-alarm'));
                    const lcd = getComputedStyle(document.querySelector('.screen-inner'));
                    results.push({theme, contrast: [contrast(hint.color, base.backgroundColor),
                        contrast(primary.color, primary.backgroundColor), contrast(lcd.color, lcd.backgroundColor)]});
                }
                app.applyTheme('cyber', false);
                app.switchTab('focus');
                area.scrollTop = 0;
                document.getElementById('btn-focus-start').click();
                const running = app.focusState === 'running' &&
                    document.getElementById('focus-play-icon').getAttribute('href') === '#icon-pause' &&
                    document.querySelector('.chip').disabled;
                document.getElementById('btn-capsule-toggle').click();
                const paused = app.focusState === 'paused' &&
                    document.getElementById('focus-start-text').textContent === '继续';
                app.resetFocusTimer();
                const modalResults = [];
                for (const id of ['alarm-overlay', 'celebrate-overlay', 'guard-overlay']) {
                    const overlay = document.getElementById(id);
                    app.setOverlay(id, true);
                    const rect = overlay.querySelector('.pixel-dialog').getBoundingClientRect();
                    modalResults.push(rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight);
                    app.setOverlay(id, false);
                }
                document.getElementById('btn-focus-start').focus();
                app.setOverlay('alarm-overlay', true);
                const dialogFocused = document.activeElement.id === 'btn-alarm-snooze' && document.getElementById('card-view').inert;
                document.getElementById('btn-alarm-dismiss').focus();
                window.dispatchEvent(new KeyboardEvent('keydown', {key: 'Tab', cancelable: true}));
                const tabTrapped = document.activeElement.id === 'btn-alarm-snooze';
                app.setOverlay('celebrate-overlay', true);
                const alarmPriority = app.activeOverlay().id === 'alarm-overlay' && document.getElementById('celebrate-overlay').inert;
                app.setOverlay('alarm-overlay', false);
                const nextDialogFocused = document.activeElement.id === 'btn-celebrate-break' || document.activeElement.id === 'btn-celebrate-dismiss';
                app.setOverlay('celebrate-overlay', false);
                const focusRestored = document.activeElement.id === 'btn-focus-start' && !document.getElementById('card-view').inert;
                const receiptPng = renderReceiptCanvasDataUrl(app.buildDailyReceiptData());
                const receiptOk = typeof receiptPng === 'string' && receiptPng.startsWith('data:image/png;base64,') && receiptPng.length > 500;
                return {results, running, paused, modalResults, receiptOk,
                    keyboard: [dialogFocused, tabTrapped, alarmPriority, nextDialogFocused, focusRestored],
                    viewport: [innerWidth, innerHeight, devicePixelRatio],
                    area: [area.clientWidth, area.clientHeight],
                    iconTarget: document.getElementById('btn-close-app').getBoundingClientRect().width};
            })()""")
            print(json.dumps({'layout': layout}, ensure_ascii=False), flush=True)
            for result in layout['results']:
                if 'contrast' in result:
                    assert min(result['contrast']) >= 4.5, result
                else:
                    assert result['horizontal'] <= 1, result
            assert layout['running'] and layout['paused'] and all(layout['modalResults']) and layout['receiptOk'], layout
            assert all(layout['keyboard']), layout
            assert layout['iconTarget'] >= 28, layout
            window.evaluate_js("app.switchMode('capsule'); app._windowSyncChain.then(() => {window.smokeCollapsed = true;});")
            wait_for('window.smokeCollapsed === true')
            assert (window.width, window.height) == (290, 68)
            print(json.dumps({'phase': action, 'snapshot': snapshot, 'window_sizes': [[290, 68], [400, 640]],
                              'native_topmost': False}, ensure_ascii=False), flush=True)
        except Exception as error:
            failures.append(error)
            print(f'SMOKE FAILURE: {error!r}', flush=True)
        finally:
            window.destroy()

    def start_check(**kwargs):
        start(check, **kwargs)

    # An asset directory containing # also checks that file URLs are encoded.
    with patch.object(app.webview, 'create_window', create_hidden), patch.object(app.webview, 'start', start_check), \
            patch.object(app, 'get_asset_path', side_effect=lambda relative: directory / relative):
        app.main()
    if failures:
        raise SystemExit(1)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['write', 'read'])
    parser.add_argument('--directory', type=Path)
    args = parser.parse_args()
    if args.phase:
        return phase(args.directory, args.phase)
    with tempfile.TemporaryDirectory(prefix='AuraFocus smoke #') as temporary:
        directory = Path(temporary)
        shutil.copytree(ROOT / 'ui', directory / 'ui')
        for action in ['write', 'read']:
            subprocess.run([sys.executable, str(Path(__file__).resolve()), '--phase', action,
                            '--directory', str(directory)], check=True, timeout=75)
        saved = json.loads((directory / 'data/state.json').read_text(encoding='utf-8'))
        assert saved['settings']['volume'] == 0
        print('Real WebView2 restart/persistence, native pin and sizing checks passed.')


if __name__ == '__main__':
    main()
