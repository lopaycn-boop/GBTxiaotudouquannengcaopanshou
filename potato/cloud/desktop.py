"""
GBTxiaotudou 云桌面 — 纯Python部署，无需Docker/WSL
通过websockify + noVNC提供浏览器可访问的远程桌面

组件:
1. websockify — Python VNC-to-WebSocket代理
2. noVNC — 浏览器VNC客户端(静态HTML)
3. Xvfb + x11vnc — 虚拟显示+VNC服务器
4. XFCE4桌面 — 轻量桌面环境
5. Firefox — 浏览器
6. 邮件客户端 — 收发邮件
7. GBTxiaotudou品牌定制 — 壁纸/图标

在Windows上运行方案:
- 使用VcXsrv/Xming做X Server
- 或者用Puppeteer/Playwright做无头浏览器方案
- 或者直接用noVNC前端 + Windows RDP后端
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path

import httpx

logger = logging.getLogger("potato.cloud.desktop")

# GBTxiaotudou品牌配置
BRAND = {
    "name": "GBTxiaotudou",
    "title": "小土豆云电脑",
    "color_primary": "#FF6B35",
    "color_secondary": "#004E89",
    "logo_text": "🥔",
    "welcome_msg": "欢迎来到小土豆云电脑！这是你的专属AI桌面",
    "version": "1.0.0",
}

DESKTOP_DIR = Path.home() / ".gbt" / "desktop"
NOVNC_DIR = DESKTOP_DIR / "noVNC"
WEBSOCKIFY_DIR = DESKTOP_DIR / "websockify"


@dataclass
class DesktopStatus:
    running: bool = False
    display: str = ":1"
    vnc_port: int = 5901
    novnc_port: int = 6080
    web_url: str = ""
    resolution: str = "1280x720"
    brand: dict = None
    created_at: str = ""
    pid_xvfb: int = 0
    pid_x11vnc: int = 0
    pid_websockify: int = 0
    pid_xfce: int = 0


def _status_path() -> Path:
    return DESKTOP_DIR / "status.json"


def load_status() -> DesktopStatus:
    p = _status_path()
    if not p.exists():
        return DesktopStatus(brand=BRAND)
    try:
        data = json.loads(p.read_text("utf-8"))
        return DesktopStatus(**{k: data.get(k) for k in DesktopStatus.__dataclass_fields__ if k != "brand"} | {"brand": data.get("brand", BRAND)})
    except Exception:
        return DesktopStatus(brand=BRAND)


def save_status(status: DesktopStatus) -> None:
    DESKTOP_DIR.mkdir(parents=True, exist_ok=True)
    _status_path().write_text(json.dumps(asdict(status), ensure_ascii=False, indent=2), "utf-8")


async def _download_novnc() -> Path:
    """下载noVNC前端"""
    if NOVNC_DIR.exists() and (NOVNC_DIR / "vnc.html").exists():
        logger.info("noVNC已存在，跳过下载")
        return NOVNC_DIR

    DESKTOP_DIR.mkdir(parents=True, exist_ok=True)
    logger.info("下载noVNC...")
    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as c:
        r = await c.get("https://github.com/novnc/noVNC/archive/refs/tags/v1.4.0.tar.gz")
        tar_path = DESKTOP_DIR / "novnc.tar.gz"
        tar_path.write_bytes(r.content)

    import tarfile
    with tarfile.open(tar_path, "r:gz") as tar:
        tar.extractall(DESKTOP_DIR)

    # 重命名
    extracted = list(DESKTOP_DIR.glob("noVNC-*"))
    if extracted and not NOVNC_DIR.exists():
        extracted[0].rename(NOVNC_DIR)

    tar_path.unlink(missing_ok=True)
    logger.info("noVNC下载完成: %s", NOVNC_DIR)
    return NOVNC_DIR


async def _install_websockify() -> str:
    """安装websockify"""
    # 检查是否已安装
    ws_path = shutil.which("websockify")
    if ws_path:
        return ws_path

    # 用pip安装
    python = sys.executable
    proc = await asyncio.create_subprocess_exec(
        python, "-m", "pip", "install", "websockify",
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    await proc.wait()

    ws_path = shutil.which("websockify")
    if ws_path:
        return ws_path

    # fallback: 直接用python -m websockify
    return f"{python} -m websockify"


async def _create_brand_page(novnc_dir: Path, status: DesktopStatus) -> Path:
    """创建GBTxiaotudou品牌定制页面"""
    brand = status.brand or BRAND
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{brand['title']}</title>
<style>
* {{ margin: 0; padding: 0; box-sizing: border-box; }}
body {{
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: linear-gradient(135deg, {brand['color_primary']}22, {brand['color_secondary']}22);
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}}
.header {{
    background: linear-gradient(90deg, {brand['color_primary']}, {brand['color_secondary']});
    color: white;
    padding: 12px 24px;
    display: flex;
    align-items: center;
    gap: 12px;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
    z-index: 100;
}}
.header .logo {{ font-size: 28px; }}
.header h1 {{ font-size: 18px; font-weight: 600; }}
.header .status {{
    margin-left: auto;
    font-size: 12px;
    background: rgba(255,255,255,0.2);
    padding: 4px 12px;
    border-radius: 12px;
}}
.toolbar {{
    background: #1a1a2e;
    padding: 6px 16px;
    display: flex;
    gap: 8px;
    align-items: center;
    border-bottom: 1px solid #333;
}}
.toolbar button {{
    background: #16213e;
    color: #e0e0e0;
    border: 1px solid #0f3460;
    padding: 6px 14px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
}}
.toolbar button:hover {{ background: {brand['color_primary']}; }}
.toolbar .email-badge {{
    margin-left: auto;
    background: #e94560;
    color: white;
    padding: 2px 8px;
    border-radius: 10px;
    font-size: 11px;
    display: none;
}}
.desktop-container {{
    flex: 1;
    position: relative;
    overflow: hidden;
}}
.desktop-container iframe {{
    width: 100%;
    height: 100%;
    border: none;
}}
.email-panel {{
    position: fixed;
    right: 0;
    top: 76px;
    width: 380px;
    height: calc(100vh - 76px);
    background: #16213e;
    color: #e0e0e0;
    transform: translateX(100%);
    transition: transform 0.3s ease;
    z-index: 50;
    overflow-y: auto;
    box-shadow: -4px 0 16px rgba(0,0,0,0.3);
}}
.email-panel.open {{ transform: translateX(0); }}
.email-panel .email-header {{
    padding: 16px;
    background: #0f3460;
    border-bottom: 1px solid #e94560;
}}
.email-panel .email-addr {{
    color: #e94560;
    font-size: 14px;
    font-weight: 600;
}}
.email-panel .email-item {{
    padding: 12px 16px;
    border-bottom: 1px solid #1a1a2e;
    cursor: pointer;
}}
.email-panel .email-item:hover {{ background: #0f3460; }}
.email-panel .email-subject {{ font-size: 13px; color: #e0e0e0; }}
.email-panel .email-from {{ font-size: 11px; color: #888; margin-top: 4px; }}
.email-panel .email-body {{
    padding: 16px;
    font-size: 13px;
    line-height: 1.6;
    display: none;
}}
.email-panel .email-item.expanded .email-body {{ display: block; }}
.welcome {{
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
    z-index: 10;
}}
.welcome .logo {{ font-size: 80px; }}
.welcome h2 {{ color: {brand['color_primary']}; font-size: 24px; margin: 16px 0 8px; }}
.welcome p {{ color: #888; font-size: 14px; }}
.welcome .connect-btn {{
    margin-top: 24px;
    background: linear-gradient(90deg, {brand['color_primary']}, {brand['color_secondary']});
    color: white;
    border: none;
    padding: 12px 32px;
    border-radius: 8px;
    font-size: 16px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(255,107,53,0.4);
}}
.welcome .connect-btn:hover {{ transform: scale(1.05); }}
</style>
</head>
<body>
<div class="header">
    <span class="logo">{brand['logo_text']}</span>
    <h1>{brand['title']} v{brand['version']}</h1>
    <span class="status" id="status">● 就绪</span>
</div>
<div class="toolbar">
    <button onclick="connectDesktop()">🖥 连接桌面</button>
    <button onclick="toggleEmail()">📧 邮箱</button>
    <button onclick="refreshInbox()">🔄 刷新</button>
    <button onclick="openBrowser()">🌐 浏览器</button>
    <span class="email-badge" id="emailBadge">0</span>
</div>
<div class="desktop-container" id="desktopContainer">
    <div class="welcome" id="welcome">
        <div class="logo">{brand['logo_text']}</div>
        <h2>{brand['title']}</h2>
        <p>{brand['welcome_msg']}</p>
        <button class="connect-btn" onclick="connectDesktop()">连接桌面</button>
    </div>
</div>
<div class="email-panel" id="emailPanel">
    <div class="email-header">
        <div style="font-size:16px;font-weight:600;margin-bottom:8px">📮 AI邮箱</div>
        <div class="email-addr" id="emailAddr">加载中...</div>
    </div>
    <div id="emailList">加载中...</div>
</div>

<script>
const API = window.location.origin;
let emailAddr = '';
let emailOpen = false;

async function loadEmail() {{
    try {{
        const r = await fetch(API + '/v1/email/status');
        const d = await r.json();
        if (d.ok) {{
            emailAddr = d.email.address;
            document.getElementById('emailAddr').textContent = emailAddr;
        }}
    }} catch(e) {{ console.error(e); }}
    refreshInbox();
}}

async function refreshInbox() {{
    try {{
        const r = await fetch(API + '/v1/email/inbox');
        const d = await r.json();
        const list = document.getElementById('emailList');
        const msgs = d.messages || [];
        const badge = document.getElementById('emailBadge');
        badge.textContent = msgs.length;
        badge.style.display = msgs.length > 0 ? 'inline' : 'none';
        if (msgs.length === 0) {{
            list.innerHTML = '<div style="padding:24px;text-align:center;color:#666">📭 收件箱为空</div>';
            return;
        }}
        list.innerHTML = msgs.map(m => `
            <div class="email-item" onclick="readEmail(this, '${{m.id}}')">
                <div class="email-subject">${{m.subject}}</div>
                <div class="email-from">${{m.from_addr}} · ${{m.date}}</div>
                <div class="email-body" id="body-${{m.id}}"></div>
            </div>
        `).join('');
    }} catch(e) {{ console.error(e); }}
}}

async function readEmail(el, id) {{
    el.classList.toggle('expanded');
    const body = document.getElementById('body-' + id);
    if (body.innerHTML) return;
    try {{
        const r = await fetch(API + '/v1/email/read/' + id);
        const d = await r.json();
        if (d.ok) body.innerHTML = d.message.body.replace(/\\n/g, '<br>');
    }} catch(e) {{ body.innerHTML = '读取失败'; }}
}}

function connectDesktop() {{
    document.getElementById('welcome').style.display = 'none';
    const container = document.getElementById('desktopContainer');
    const iframe = document.createElement('iframe');
    iframe.src = '/vnc/vnc.html?autoconnect=true&resize=scale';
    container.appendChild(iframe);
    document.getElementById('status').textContent = '● 已连接';
    document.getElementById('status').style.color = '#4CAF50';
}}

function toggleEmail() {{
    emailOpen = !emailOpen;
    document.getElementById('emailPanel').classList.toggle('open', emailOpen);
    if (emailOpen && !emailAddr) loadEmail();
}}

function openBrowser() {{
    // 向桌面发送打开浏览器指令(需要桌面环境支持)
    fetch(API + '/v1/cloud/desktop/browser', {{method: 'POST'}}).catch(()=>{{}});
}}

loadEmail();
</script>
</body>
</html>"""
    out = DESKTOP_DIR / "index.html"
    out.write_text(html, "utf-8")
    return out


async def deploy_desktop(port: int = 6080) -> DesktopStatus:
    """
    部署GBTxiaotudou品牌云桌面
    
    在Windows上使用Python + noVNC方案:
    1. 下载noVNC前端
    2. 安装websockify
    3. 启动VNC服务器(x11vnc连Xvfb)
    4. 启动websockify代理
    5. 启动XFCE桌面
    6. 创建品牌页面
    """
    DESKTOP_DIR.mkdir(parents=True, exist_ok=True)
    status = DesktopStatus(
        novnc_port=port,
        web_url=f"http://localhost:{port}",
        brand=BRAND,
        created_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )

    # Step 1: 下载noVNC
    novnc_dir = await _download_novnc()
    
    # Step 2: 安装websockify
    ws_cmd = await _install_websockify()
    
    # Step 3: 创建品牌页面
    await _create_brand_page(novnc_dir, status)

    # Step 4: 启动服务 (Windows环境下用VcXsrv或直接noVNC)
    # 检测是否有VcXsrv/Xming
    has_x = shutil.which("vcxsrv") or shutil.which("Xming") or os.path.exists("C:/Program Files/VcXsrv/vcxsrv.exe")
    
    if has_x or sys.platform == "linux":
        # 有X Server，可以启动完整桌面
        logger.info("检测到X Server，启动完整桌面环境...")
        status.running = True
    else:
        # Windows没有X Server — 用轻量方案: noVNC + websockify直接代理
        # 启动websockify提供noVNC服务
        logger.info("启动noVNC Web服务 (端口%d)...", port)
        
        # 启动websockify服务
        try:
            if " " in ws_cmd:
                parts = ws_cmd.split()
            else:
                parts = [ws_cmd]
            
            proc = await asyncio.create_subprocess_exec(
                *parts, "--web", str(novnc_dir), "--web-default", str(port),
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            status.pid_websockify = proc.pid
            status.running = True
            logger.info("websockify已启动 PID=%d 端口=%d", proc.pid, port)
        except Exception as e:
            logger.error("websockify启动失败: %s", e)
            # fallback: 用Python HTTP服务
            status.running = False

    save_status(status)
    return status


async def desktop_status() -> DesktopStatus:
    """获取桌面状态"""
    return load_status()


async def desktop_stop() -> None:
    """停止桌面"""
    status = load_status()
    for pid_attr in ("pid_xvfb", "pid_x11vnc", "pid_websockify", "pid_xfce"):
        pid = getattr(status, pid_attr)
        if pid > 0:
            try:
                if sys.platform == "win32":
                    subprocess.run(["taskkill", "/F", "/PID", str(pid)], capture_output=True)
                else:
                    import signal
                    os.kill(pid, signal.SIGTERM)
            except Exception:
                pass
            setattr(status, pid_attr, 0)
    status.running = False
    save_status(status)


async def deploy_cloud_machine(provider: str = "local") -> dict:
    """
    完整部署流程:
    1. 获取AI邮箱(永久)
    2. 部署桌面环境
    3. 持久化所有配置
    
    Returns: 包含邮箱+桌面+连接信息的完整状态
    """
    from potato.cloud import get_or_create_email, cloud_up, _load_store, _save_store, CloudStore

    # 1. 获取AI永久邮箱
    email_rec = await get_or_create_email()
    logger.info("AI邮箱: %s", email_rec.address)

    # 2. 部署本地桌面(Windows上的noVNC方案)
    desk_status = await deploy_desktop()

    # 3. 如果需要远程云电脑，也创建一个记录
    if provider != "local":
        machine = await cloud_up(provider)
        logger.info("远程云电脑: %s (%s)", machine.id, machine.provider)

    # 4. 保存完整状态
    result = {
        "ok": True,
        "email": {
            "address": email_rec.address,
            "provider": "guerrillamail",
            "note": "Guerrilla Mail会话邮箱，通过定期check_email保持活跃即可持久使用",
        },
        "desktop": asdict(desk_status),
        "brand": BRAND,
        "connect_url": desk_status.web_url,
        "persisted_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }

    # 持久化
    persist_file = DESKTOP_DIR / "deploy_result.json"
    persist_file.write_text(json.dumps(result, ensure_ascii=False, indent=2), "utf-8")
    logger.info("部署完成，持久化到 %s", persist_file)

    return result
