# -*- mode: python ; coding: utf-8 -*-
import os

a = Analysis(
    [os.path.join(SPECPATH, 'app.py')],
    pathex=[SPECPATH],
    binaries=[],
    datas=[(os.path.join(SPECPATH, 'ui'), 'ui')],
    hiddenimports=[],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['PyQt5', 'PyQtWebEngine', 'qtpy', 'scipy', 'matplotlib', 'pandas', 'IPython', 'jupyter', 'PIL', 'torch', 'torchvision', 'cv2', 'sklearn', 'notebook', 'tornado', 'zmq', 'pytest'],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='AuraFocus',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    icon=os.path.join(SPECPATH, 'ui', 'icon.ico'),
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
