# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for 小土豆 AI操盘桌宠 backend"""

import sys
from pathlib import Path

ROOT = Path(SPECPATH)

# Collect all potato sub-packages
potato_datas = []
for p in (ROOT / 'potato').rglob('*'):
    if p.is_file() and not p.name.endswith('.pyc') and '__pycache__' not in str(p):
        rel = p.relative_to(ROOT)
        potato_datas.append((str(p), str(rel.parent)))

# backend local modules
backend_datas = []
for p in (ROOT / 'desktop_pet' / 'backend').rglob('*'):
    if p.is_file() and not p.name.endswith('.pyc') and '__pycache__' not in str(p):
        if p.suffix in ('.py', '.json'):
            rel = p.relative_to(ROOT / 'desktop_pet' / 'backend')
            backend_datas.append((str(p), str(rel.parent)))

# schema
schema_datas = [(str(ROOT / 'schema' / 'init.sql'), 'schema')]

a = Analysis(
    [str(ROOT / 'desktop_pet' / 'backend' / 'main.py')],
    pathex=[
        str(ROOT),
        str(ROOT / 'desktop_pet' / 'backend'),
        str(ROOT / 'potato'),
    ],
    binaries=[],
    datas=potato_datas + backend_datas + schema_datas,
    hiddenimports=[
        # potato sub-packages
        'potato', 'potato.version', 'potato.config', 'potato.cycle', 'potato.db',
        'potato.billing', 'potato.eastmoney', 'potato.iwencai', 'potato.llm',
        'potato.memory', 'potato.risk', 'potato.vault', 'potato.security',
        'potato.analysis', 'potato.intel', 'potato.cache', 'potato.credentials',
        'potato.notifications', 'potato.plugins', 'potato.secret_store',
        'potato.telegram_bot', 'potato.trendradar', 'potato.user_prefs',
        'potato.verify', 'potato.vision', 'potato.voice', 'potato.paths',
        'potato.bootstrap_config', 'potato.bot_activation', 'potato.cycle_timeout',
        'potato.browser', 'potato.browser.actions', 'potato.browser.engine',
        'potato.browser.platforms', 'potato.browser.verify', 'potato.browser.desktop_apps',
        'potato.cloud', 'potato.cloud.desktop', 'potato.cloud.web_desktop',
        'potato.knowledge',
        'potato.trading', 'potato.trading.scheduler', 'potato.trading.journal',
        'potato.trading.executor', 'potato.trading.analyzer', 'potato.trading.broker',
        'potato.trading.plan_execute',
        # backend local
        'services', 'config', 'memory', 'tools', 'db_plugin', 'bytebot_client',
        # third-party hidden
        'uvicorn.logging', 'uvicorn.loops', 'uvicorn.loops.auto',
        'uvicorn.protocols', 'uvicorn.protocols.http', 'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets', 'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan', 'uvicorn.lifespan.on',
        'chromadb', 'chromadb.config',
        'numpy', 'PIL', 'qrcode', 'edge_tts',
        'httpx', 'aiohttp', 'pydantic', 'yaml',
        'cryptography', 'cryptography.hazmat', 'cryptography.hazmat.primitives',
        'dotenv', 'tiktoken',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        'tkinter', 'matplotlib', 'scipy', 'pandas', 'IPython',
        'jupyter', 'notebook', 'sphinx', 'pytest',
    ],
    noarchive=False,
)

pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='potato-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=True,
    icon=str(ROOT / 'desktop_pet' / 'electron' / 'assets' / 'icon.ico'),
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    name='potato-backend',
)
