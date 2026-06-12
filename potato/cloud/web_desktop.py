"""
GBTxiaotudou Web桌面 — 纯浏览器云电脑，无需VNC/X Server
功能: 终端、文件管理、邮箱、浏览器书签、系统信息
"""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path

logger = __import__("logging").getLogger("potato.cloud.web_desktop")

DESKTOP_DIR = Path.home() / ".gbt" / "desktop"
BRAND = {
    "name": "GBTxiaotudou",
    "title": "小土豆云电脑",
    "color_primary": "#FF6B35",
    "color_secondary": "#004E89",
    "logo_text": "🥔",
    "welcome_msg": "欢迎来到小土豆云电脑！",
    "version": "1.0.0",
}


def generate_desktop_html(api_base: str = "") -> str:
    """生成完整Web桌面HTML"""
    b = BRAND
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{b['title']}</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0d1117;color:#c9d1d9;overflow:hidden;height:100vh;display:flex;flex-direction:column}}
.topbar{{background:linear-gradient(90deg,{b['color_primary']},{b['color_secondary']});padding:8px 16px;display:flex;align-items:center;gap:10px;box-shadow:0 2px 8px rgba(0,0,0,.3);z-index:100;flex-shrink:0}}
.topbar .logo{{font-size:24px;cursor:pointer}}
.topbar h1{{color:#fff;font-size:15px;font-weight:600}}
.topbar .clock{{margin-left:auto;color:rgba(255,255,255,.8);font-size:13px;font-variant-numeric:tabular-nums}}
.dock{{background:#161b22;padding:4px 8px;display:flex;gap:4px;border-bottom:1px solid #30363d;flex-shrink:0;overflow-x:auto}}
.dock button{{background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:12px;white-space:nowrap}}
.dock button:hover{{background:{b['color_primary']};border-color:{b['color_primary']}}}
.dock button.active{{background:{b['color_secondary']};border-color:{b['color_secondary']};color:#fff}}
.dock .badge{{background:#e94560;color:#fff;padding:1px 6px;border-radius:8px;font-size:10px;margin-left:4px}}
.workspace{{flex:1;overflow:hidden;position:relative}}
.panel{{position:absolute;inset:0;display:none;flex-direction:column;background:#0d1117}}
.panel.active{{display:flex}}
.panel-header{{padding:8px 12px;background:#161b22;border-bottom:1px solid #30363d;font-size:13px;font-weight:600;display:flex;align-items:center;gap:8px}}
.panel-body{{flex:1;overflow:auto;padding:12px}}
/* Terminal */
.terminal{{font-family:'Cascadia Code','Fira Code','Consolas',monospace;font-size:13px;background:#010409;color:#39d353;flex:1;overflow:auto;padding:12px;line-height:1.5}}
.terminal .prompt{{color:#58a6ff}}
.terminal .error{{color:#f85149}}
.terminal .info{{color:#8b949e}}
.terminal-input{{display:flex;padding:0 12px 12px;background:#010409}}
.terminal-input span{{color:#58a6ff;font-family:monospace;font-size:13px;white-space:nowrap}}
.terminal-input input{{flex:1;background:transparent;border:none;color:#39d353;font-family:monospace;font-size:13px;outline:none;margin-left:4px}}
/* File Manager */
.fm-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(120px,1fr));gap:12px}}
.fm-item{{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:12px;text-align:center;cursor:pointer;font-size:12px}}
.fm-item:hover{{border-color:{b['color_primary']};background:#21262d}}
.fm-item .icon{{font-size:32px;margin-bottom:4px}}
.fm-item .size{{color:#8b949e;font-size:10px}}
/* Email */
.email-list{{list-style:none}}
.email-item{{padding:12px;border-bottom:1px solid #21262d;cursor:pointer}}
.email-item:hover{{background:#161b22}}
.email-item.unread{{border-left:3px solid {b['color_primary']}}}
.email-subject{{font-size:14px;font-weight:600;margin-bottom:4px}}
.email-meta{{font-size:12px;color:#8b949e}}
.email-body{{padding:16px;line-height:1.7;font-size:14px;display:none;margin-top:8px;background:#161b22;border-radius:6px}}
.email-item.expanded .email-body{{display:block}}
.email-compose{{background:#161b22;padding:12px;border-radius:6px;margin-top:8px}}
.email-compose input,.email-compose textarea{{width:100%;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:8px;border-radius:4px;font-size:13px;margin-bottom:8px}}
.email-compose textarea{{min-height:100px;resize:vertical}}
.email-compose button{{background:{b['color_primary']};color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer}}
/* System Info */
.sys-grid{{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}}
.sys-card{{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:16px}}
.sys-card h3{{font-size:13px;color:{b['color_primary']};margin-bottom:8px}}
.sys-card .value{{font-size:20px;font-weight:700}}
.sys-card .label{{font-size:11px;color:#8b949e;margin-top:4px}}
.progress-bar{{background:#21262d;border-radius:4px;height:8px;margin-top:8px;overflow:hidden}}
.progress-fill{{height:100%;border-radius:4px;transition:width .5s}}
/* Welcome */
.welcome{{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;z-index:10;background:linear-gradient(135deg,#0d1117,#161b22)}}
.welcome-card{{text-align:center;max-width:400px}}
.welcome-card .logo{{font-size:80px;margin-bottom:16px}}
.welcome-card h2{{color:{b['color_primary']};font-size:28px;margin-bottom:8px}}
.welcome-card p{{color:#8b949e;line-height:1.6;margin-bottom:24px}}
.welcome-card button{{background:linear-gradient(90deg,{b['color_primary']},{b['color_secondary']});color:#fff;border:none;padding:14px 36px;border-radius:8px;font-size:16px;cursor:pointer;box-shadow:0 4px 12px rgba(255,107,53,.4)}}
.welcome-card button:hover{{transform:scale(1.05)}}
.status-bar{{background:#161b22;padding:4px 12px;border-top:1px solid #30363d;font-size:11px;color:#8b949e;display:flex;justify-content:space-between;flex-shrink:0}}
</style>
</head>
<body>
<div class="topbar">
<span class="logo">{b['logo_text']}</span>
<h1>{b['title']} v{b['version']}</h1>
<span class="clock" id="clock"></span>
</div>
<div class="dock">
<button onclick="showPanel('welcome')" id="btn-welcome">🏠 主页</button>
<button onclick="showPanel('terminal')" id="btn-terminal">💻 终端</button>
<button onclick="showPanel('files')" id="btn-files">📁 文件</button>
<button onclick="showPanel('email')" id="btn-email">📧 邮箱<span class="badge" id="emailBadge" style="display:none">0</span></button>
<button onclick="showPanel('system')" id="btn-system">📊 系统</button>
<button onclick="showPanel('browser')" id="btn-browser">🌐 浏览器</button>
</div>
<div class="workspace">
<div class="panel" id="panel-welcome">
<div class="welcome">
<div class="welcome-card">
<div class="logo">{b['logo_text']}</div>
<h2>{b['title']}</h2>
<p>{b['welcome_msg']}<br>这是你的专属AI桌面，点击下方按钮开始使用。</p>
<button onclick="showPanel('terminal')">开始使用</button>
</div>
</div>
</div>
<div class="panel" id="panel-terminal">
<div class="panel-header">💻 终端 — GBTxiaotudou Cloud Shell</div>
<div class="terminal" id="termOutput"><span class="info">小土豆云终端 v1.0 — 输入命令开始</span></div>
<div class="terminal-input"><span>🥔 $</span><input id="termInput" autofocus onkeydown="if(event.key==='Enter')execCmd()"></div>
</div>
<div class="panel" id="panel-files">
<div class="panel-header">📁 文件管理器 — <span id="fmPath">/</span></div>
<div class="panel-body"><div class="fm-grid" id="fmGrid"></div></div>
</div>
<div class="panel" id="panel-email">
<div class="panel-header">📧 邮箱 — <span id="emailAddr">加载中...</span></div>
<div class="panel-body">
<button onclick="composeEmail()" style="background:{b['color_primary']};color:#fff;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-bottom:12px">✉️ 写邮件</button>
<div id="emailCompose" style="display:none" class="email-compose">
<input id="emailTo" placeholder="收件人">
<input id="emailSubject" placeholder="主题">
<textarea id="emailBody" placeholder="正文"></textarea>
<button onclick="sendEmail()">发送</button>
</div>
<ul class="email-list" id="emailList"></ul>
</div>
</div>
<div class="panel" id="panel-system">
<div class="panel-header">📊 系统信息</div>
<div class="panel-body"><div class="sys-grid" id="sysGrid"></div></div>
</div>
<div class="panel" id="panel-browser">
<div class="panel-header">🌐 快捷导航</div>
<div class="panel-body" id="browserBookmarks"></div>
</div>
</div>
<div class="status-bar">
<span id="statusLeft">● 就绪</span>
<span id="statusRight"></span>
</div>
<script>
const API='{api_base}';
let currentPath='/';
let emailData={{}};
// Clock
setInterval(()=>{{const d=new Date();document.getElementById('clock').textContent=d.toLocaleString('zh-CN');}},1000);
// Panels
function showPanel(id){{
document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
document.querySelectorAll('.dock button').forEach(b=>b.classList.remove('active'));
const p=document.getElementById('panel-'+id);
if(p){{p.classList.add('active');const btn=document.getElementById('btn-'+id);if(btn)btn.classList.add('active');}}
if(id==='files')loadFiles(currentPath);
if(id==='email')loadEmails();
if(id==='system')loadSystem();
if(id==='browser')loadBrowser();
if(id==='terminal')document.getElementById('termInput').focus();
}}
// Terminal
const cmdHistory=[];
let histIdx=-1;
async function execCmd(){{
const input=document.getElementById('termInput');
const cmd=input.value.trim();
if(!cmd)return;
input.value='';
cmdHistory.unshift(cmd);histIdx=-1;
const out=document.getElementById('termOutput');
out.innerHTML+=`<div><span class="prompt">🥔 $ </span>${{escHtml(cmd)}}</div>`;
try{{
const r=await fetch(API+'/v1/cloud/desktop/exec',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{cmd}})}});
const d=await r.json();
if(d.ok)out.innerHTML+=`<div>${{escHtml(d.output).replace(/\\n/g,'<br>')}}</div>`;
else out.innerHTML+=`<div class="error">${{escHtml(d.error)}}</div>`;
}}catch(e){{out.innerHTML+=`<div class="error">执行失败: ${{e.message}}</div>`;}}
out.scrollTop=out.scrollHeight;
}}
function escHtml(s){{return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');}}
// Files
async function loadFiles(path){{
try{{
const r=await fetch(API+'/v1/cloud/desktop/files?path='+encodeURIComponent(path));
const d=await r.json();
if(!d.ok){{document.getElementById('fmGrid').innerHTML=`<div>错误: ${{d.error}}</div>`;return;}}
document.getElementById('fmPath').textContent=path;
const grid=document.getElementById('fmGrid');
grid.innerHTML=d.items.map(f=>`<div class="fm-item" onclick="${{f.is_dir?`loadFiles('${{f.path.replace(/'/g,"\\\\'")}}')':'downloadFile(f.path)'}}"><div class="icon">${{f.is_dir?'📂':'📄'}}</div><div>${{f.name}}</div><div class="size">${{f.size}}</div></div>`).join('');
}}catch(e){{document.getElementById('fmGrid').innerHTML=`<div>加载失败</div>`;}}
}}
// Email
async function loadEmails(){{
try{{
const r=await fetch(API+'/v1/email/status');
const d=await r.json();
if(d.ok){{emailData=d.email;document.getElementById('emailAddr').textContent=d.email.address;}}
const r2=await fetch(API+'/v1/email/inbox');
const d2=await r2.json();
const msgs=d2.messages||[];
const badge=document.getElementById('emailBadge');
badge.textContent=msgs.length;badge.style.display=msgs.length>0?'inline':'none';
const list=document.getElementById('emailList');
if(msgs.length===0){{list.innerHTML='<div style="padding:24px;text-align:center;color:#8b949e">📭 收件箱为空</div>';return;}}
list.innerHTML=msgs.map(m=>`<li class="email-item" onclick="readMail(this,'${{m.id}}')"><div class="email-subject">${{escHtml(m.subject)}}</div><div class="email-meta">${{escHtml(m.from_addr)}} · ${{m.date}}</div><div class="email-body" id="body-${{m.id}}"></div></li>`).join('');
}}catch(e){{document.getElementById('emailList').innerHTML='<div>加载失败</div>';}}
}}
async function readMail(el,id){{
el.classList.toggle('expanded');
const body=document.getElementById('body-'+id);
if(body.innerHTML)return;
try{{
const r=await fetch(API+'/v1/email/read/'+id);
const d=await r.json();
if(d.ok)body.innerHTML=d.message.body.replace(/\\n/g,'<br>');
}}catch(e){{body.innerHTML='读取失败';}}
}}
function composeEmail(){{document.getElementById('emailCompose').style.display='block';}}
async function sendEmail(){{
const to=document.getElementById('emailTo').value;
const subj=document.getElementById('emailSubject').value;
const body=document.getElementById('emailBody').value;
try{{
const r=await fetch(API+'/v1/email/send',{{method:'POST',headers:{{'Content-Type':'application/json'}},body:JSON.stringify({{to,subject:subj,body}})}});
const d=await r.json();alert(d.ok?'发送成功!':'发送失败: '+d.error);
}}catch(e){{alert('发送失败');}}
}}
// System
async function loadSystem(){{
try{{
const r=await fetch(API+'/v1/cloud/desktop/sysinfo');
const d=await r.json();
const grid=document.getElementById('sysGrid');
const cards=[];
if(d.os)cards.push(sysCard('💻 操作系统',d.os.name+d.os.version,'',''));
if(d.cpu)cards.push(sysCard('🖥 CPU',d.cpu.count+'核','使用率',''+d.cpu.percent+'%','#58a6ff',d.cpu.percent));
if(d.memory)cards.push(sysCard('💾 内存',d.memory.used+' / '+d.memory.total,'已用',''+d.memory.percent+'%','#e94560',d.memory.percent));
if(d.disk)cards.push(sysCard('💿 磁盘',d.disk.used+' / '+d.disk.total,'已用',''+d.disk.percent+'%','{b["color_primary"]}',d.disk.percent));
cards.push(sysCard('🥔 品牌',b.name,'版本',b.version,'',0));
if(d.email)cards.push(sysCard('📧 邮箱',d.email.address,'提供商',d.email.provider,'',0));
grid.innerHTML=cards.join('');
}}catch(e){{document.getElementById('sysGrid').innerHTML='<div>加载失败</div>';}}
}}
function sysCard(title,value,label,extra,color,pct){{
let bar='';
if(pct>0)bar=`<div class="progress-bar"><div class="progress-fill" style="width:${{pct}}%;background:${{color||'#58a6ff'}}"></div></div>`;
return `<div class="sys-card"><h3>${{title}}</h3><div class="value">${{value}}</div><div class="label">${{label}}: ${{extra}}</div>${{bar}}</div>`;
}}
// Browser
function loadBrowser(){{
const bm=[{{name:'Google',url:'https://www.google.com',icon:'🔍'}},{{name:'GitHub',url:'https://github.com',icon:'🐙'}},{{name:'HuggingFace',url:'https://huggingface.co',icon:'🤗'}},{{name:'B站',url:'https://bilibili.com',icon:'📺'}},{{name:'知乎',url:'https://zhihu.com',icon:'💡'}},{{name:'微博',url:'https://weibo.com',icon:'📝'}},{{name:'抖音',url:'https://douyin.com',icon:'🎵'}},{{name:'淘宝',url:'https://taobao.com',icon:'🛒'}}];
document.getElementById('browserBookmarks').innerHTML='<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px">'+bm.map(b=>`<a href="${{b.url}}" target="_blank" style="text-decoration:none"><div class="fm-item"><div class="icon">${{b.icon}}</div><div>${{b.name}}</div></div></a>`).join('')+'</div>';
}}
showPanel('welcome');
</script>
</body>
</html>"""
