import ctypes
from concurrent.futures import ThreadPoolExecutor
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest.mock import patch

# Unit tests need only the standard library and Win32, not a running WebView.
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
sys.modules.setdefault('webview', types.ModuleType('webview'))
spec = importlib.util.spec_from_file_location('aurafocus', ROOT / 'app.py')
app = importlib.util.module_from_spec(spec)
spec.loader.exec_module(app)
import win32_native


def state(volume=0):
    return {'version': 2, 'settings': {'volume': volume}, 'alarms': [], 'stats': {'days': {}}}


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='AuraFocus-test-')
        self.addCleanup(self.directory.cleanup)
        self.store = app.StateStore(self.directory.name)

    def test_round_trip_from_new_store(self):
        saved = state()
        saved['alarms'] = [{'title': '会议与喝水'}]
        self.store.save(saved)
        self.assertEqual(app.StateStore(self.directory.name).load(), saved)
        self.assertEqual(list(Path(self.directory.name).glob('*.tmp')), [])

    def test_failed_replace_preserves_previous_file(self):
        self.store.save(state(10))
        with patch.object(app.os, 'replace', side_effect=PermissionError('busy')):
            with self.assertRaises(PermissionError):
                self.store.save(state(90))
        self.assertEqual(self.store.load(), state(10))
        self.assertEqual(list(Path(self.directory.name).glob('*.tmp')), [])

    def test_invalid_json_is_preserved_for_recovery(self):
        self.store.path.write_text('{broken', encoding='utf-8')
        self.assertIsNone(self.store.load())
        backups = list(Path(self.directory.name).glob('state.corrupt-*.json'))
        self.assertEqual(len(backups), 1)
        self.assertEqual(backups[0].read_text(), '{broken')
        self.store.save(state())
        self.assertEqual(self.store.load(), state())

    def test_v3_round_trip_preserves_window_audio_and_collection(self):
        saved = {
            'version': 3,
            'window': {'x': 120, 'y': 80},
            'settings': {'volume': 55, 'theme': 'obsidian'},
            'audio': {'preset': 'office_shield', 'tracks': {'shield': 70}},
            'alarms': [],
            'stats': {'days': {}},
        }
        self.store.save(saved)
        self.assertEqual(app.StateStore(self.directory.name).load(), saved)

    def test_invalid_numbers_and_versions_do_not_replace_good_data(self):
        self.store.save(state())
        for bad in ({'version': 9}, state(float('nan'))):
            with self.assertRaises(ValueError):
                self.store.save(bad)
        self.assertEqual(self.store.load(), state())

    def test_concurrent_writes_leave_a_complete_json_document(self):
        stores = [self.store, app.StateStore(self.directory.name)]
        with ThreadPoolExecutor(max_workers=4) as pool:
            futures = [pool.submit(stores[volume % 2].save, state(volume)) for volume in range(20)]
            for future in futures:
                future.result(timeout=3)
        self.assertIn(self.store.load()['settings']['volume'], range(20))


class WindowTests(unittest.TestCase):
    def test_left_and_upper_monitors_keep_negative_coordinates(self):
        self.assertEqual(app.fit_position(app.RECT(-1500, -900, -1210, -832), (-1920, -1080, 0, 0)), (-1500, -900))
        self.assertEqual(app.fit_position(app.RECT(-1910, -1070, -1620, -1002), (-1920, -1080, 0, 0), 45), (-1920, -1080))

    def test_resize_clamps_to_current_monitor(self):
        self.assertEqual(app.fit_position(app.RECT(3700, 950, 4080, 1510), (1920, 0, 3840, 1040)), (3460, 480))

    def test_work_area_uses_native_monitor_rectangle(self):
        api = app.BridgeApi(data_dir='unused')
        rect = app.RECT(-1800, -500, -1510, -432)
        def fill_info(_monitor, pointer):
            info = ctypes.cast(pointer, ctypes.POINTER(app.MONITORINFO)).contents
            info.rcWork = app.RECT(-1920, -1080, 0, 0)
            return 1
        with patch.object(app._user32, 'MonitorFromRect', return_value=99) as monitor:
            with patch.object(app._user32, 'GetMonitorInfoW', side_effect=fill_info):
                self.assertEqual(api._get_work_area(rect), (-1920, -1080, 0, 0))
        self.assertEqual(monitor.call_args.args[1], 2)

    def test_drag_uses_absolute_native_cursor_and_ignores_late_messages(self):
        api = app.BridgeApi(data_dir='unused')
        api._rect = lambda: app.RECT(500, 100, 790, 168)
        api._cursor = lambda: (520, 110)
        moves = []
        api._move = lambda x, y: moves.append((x, y))
        api.begin_drag()
        api._cursor = lambda: (-1300, -800)
        workers = [threading.Thread(target=api.drag_to) for _ in range(12)]
        for worker in workers:
            worker.start()
        for worker in workers:
            worker.join(timeout=3)
        self.assertEqual(set(moves), {(-1320, -810)})
        api._drag_origin = None
        moves.clear()
        api.drag_to()
        self.assertEqual(moves, [])

    def test_main_disables_builtin_drag_sets_small_minimum_and_encodes_url(self):
        calls = {}
        fake = types.SimpleNamespace(
            screens=[types.SimpleNamespace(x=-1920, y=0, width=1920, height=1080)],
            create_window=lambda **kwargs: calls.update(window=kwargs) or object(),
            start=lambda **kwargs: calls.update(start=kwargs),
        )
        with tempfile.TemporaryDirectory(prefix='AuraFocus-main-') as temp_dir:
            with patch.dict(app.os.environ, {'AURAFOCUS_DATA_DIR': temp_dir}), \
                    patch.object(app, 'webview', fake), \
                    patch.object(app, 'get_asset_path', return_value=Path('D:/folder #1/ui/index.html')):
                app.main()
        self.assertFalse(calls['window']['easy_drag'])
        self.assertEqual(calls['window']['min_size'], (20, 68))
        self.assertIn('%23', calls['window']['url'])
        self.assertFalse(calls['start']['private_mode'])
        self.assertEqual(calls['window']['x'], -340)

    def test_resolve_initial_position_restores_and_clamps_saved_window(self):
        screens = [
            types.SimpleNamespace(x=-1920, y=0, width=1920, height=1080),
            types.SimpleNamespace(x=0, y=0, width=1920, height=1080),
        ]
        self.assertEqual(app.resolve_initial_position({'window': {'x': -1200, 'y': 240}}, screens), (-1200, 240))
        self.assertEqual(app.resolve_initial_position({'window': {'x': 5000, 'y': 3000}}, screens), (1630, 1012))
        self.assertEqual(app.resolve_initial_position({'window': {'x': None, 'y': None}}, screens), (-340, 50))


class NativeWin32FeatureTests(unittest.TestCase):
    def test_match_distraction_ignores_own_pid_and_matches_title_or_process(self):
        rules = ['bilibili', 'steam', '抖音']
        self.assertIsNone(win32_native.match_distraction('bilibili - AuraFocus', 'python.exe', rules, own_pid=100, current_pid=100))
        self.assertIsNone(win32_native.match_distraction('', 'explorer.exe', rules, own_pid=100, current_pid=200))
        self.assertEqual(win32_native.match_distraction('【教程】BiliBili 弹幕网', 'msedge.exe', rules, own_pid=100, current_pid=200), 'bilibili')
        self.assertEqual(win32_native.match_distraction('Friends List', 'Steam.exe', rules, own_pid=100, current_pid=200), 'steam')
        self.assertIsNone(win32_native.match_distraction('app.py - Visual Studio Code', 'Code.exe', rules, own_pid=100, current_pid=200))

    def test_focus_guard_tracker_debounces_clears_and_respects_temp_allow(self):
        tracker = win32_native.FocusGuardTracker(own_pid=100)
        rules = ['bilibili']
        fg_bad = (200, '视频 - bilibili', 'chrome.exe')
        fg_good = (300, 'main.py - VS Code', 'Code.exe')

        self.assertIsNone(tracker.update(0.0, True, fg_bad, rules, delay_sec=15, strict=False))
        self.assertIsNone(tracker.update(14.0, True, fg_bad, rules, delay_sec=15, strict=False))
        evt = tracker.update(15.0, True, fg_bad, rules, delay_sec=15, strict=False)
        self.assertEqual(evt['type'], 'nudge')
        self.assertEqual(evt['matched'], 'bilibili')
        self.assertFalse(evt['strict'])
        # Within cooldown no duplicate nudge
        self.assertIsNone(tracker.update(25.0, True, fg_bad, rules, delay_sec=15, strict=False))
        # Returning to work clears nudge
        self.assertEqual(tracker.update(26.0, True, fg_good, rules, delay_sec=15, strict=False), {'type': 'clear'})
        # Temporary 3-minute allow suppresses alerts
        tracker.allow_temp(30.0, 180)
        self.assertIsNone(tracker.update(100.0, True, fg_bad, rules, delay_sec=15, strict=True))

    def test_compute_peek_geometry_handles_left_right_and_floating(self):
        work = (0, 0, 1920, 1040)
        left_geom = win32_native.compute_peek_geometry(app.RECT(6, 120, 296, 188), work, peek_width=20, edge_margin=16)
        self.assertEqual((left_geom['side'], left_geom['peek_x'], left_geom['restore_x']), ('left', 0, 0))
        right_geom = win32_native.compute_peek_geometry(app.RECT(1625, 120, 1915, 188), work, peek_width=20, edge_margin=16)
        self.assertEqual((right_geom['side'], right_geom['peek_x'], right_geom['restore_x']), ('right', 1900, 1630))
        self.assertIsNone(win32_native.compute_peek_geometry(app.RECT(600, 120, 890, 188), work, peek_width=20, edge_margin=16))

    def test_generated_ico_loads_as_valid_win32_icon(self):
        icon_path = ROOT / 'ui/icon.ico'
        self.assertTrue(icon_path.exists())
        hicon = win32_native._user32.LoadImageW(None, str(icon_path), win32_native.IMAGE_ICON, 16, 16, win32_native.LR_LOADFROMFILE)
        self.assertTrue(bool(hicon))
        win32_native._user32.DestroyIcon(hicon)

    def test_bridge_save_png_writes_decoded_bytes_and_handles_cancel(self):
        import base64
        with tempfile.TemporaryDirectory(prefix='AuraFocus-png-') as temp_dir:
            out = Path(temp_dir) / 'receipt'
            api = app.BridgeApi(data_dir=temp_dir)
            api.set_window(types.SimpleNamespace(create_file_dialog=lambda *_a, **_kw: str(out)))
            payload = 'data:image/png;base64,' + base64.b64encode(b'\x89PNG\r\n\x1a\nFAKE').decode('ascii')
            res = api.save_png(payload, 'test.png')
            self.assertEqual(res['status'], 'ok')
            self.assertTrue(Path(res['path']).name.endswith('.png'))
            self.assertEqual(Path(res['path']).read_bytes(), b'\x89PNG\r\n\x1a\nFAKE')

            api.set_window(types.SimpleNamespace(create_file_dialog=lambda *_a, **_kw: None))
            self.assertEqual(api.save_png(payload, 'test.png')['status'], 'cancelled')


if __name__ == '__main__':
    unittest.main()
