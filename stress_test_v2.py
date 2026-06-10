#!/usr/bin/env python3
"""GBTxiaotudou 全栈压力测试 v2 — 尊重限流，测试真实场景"""
import asyncio
import aiohttp
import time
import json
import sys
import random
from collections import defaultdict

BASE = "http://127.0.0.1:8000"
# 限流参数: HTTP 120/60s=2qps, WS 30/5s=6qps
# 测试使用安全速率，同时测试限流边界
HTTP_SAFE_QPS = 1.5
HTTP_BURST = 5  # 单次突发

RESULTS = defaultdict(list)
FAILURES = []
LIMITS_HIT = defaultdict(int)

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def report():
    print("\n" + "="*65)
    print("  全栈压力测试报告 v2")
    print("="*65)
    
    categories = {}
    for name, times in sorted(RESULTS.items()):
        cat = name.split("/")[0].strip() if "/" in name else name.split()[0]
        if cat not in categories:
            categories[cat] = []
        ok = [t for t in times if t is not None]
        fail = len(times) - len(ok)
        if ok:
            avg = sum(ok)/len(ok)
            mx = max(ok)
            mn = min(ok)
            p50 = sorted(ok)[int(len(ok)*0.50)] if len(ok) > 1 else ok[0]
            p95 = sorted(ok)[int(len(ok)*0.95)] if len(ok) > 1 else ok[0]
            p99 = sorted(ok)[int(len(ok)*0.99)] if len(ok) > 2 else mx
            categories[cat].append(
                f"  {name:35s} | n={len(ok):3d} fail={fail:2d} | "
                f"p50={p50:.0f}ms p95={p95:.0f}ms p99={p99:.0f}ms max={mx:.0f}ms"
            )
        else:
            categories[cat].append(f"  {name:35s} | ALL FAILED ({fail})")
    
    for cat, lines in categories.items():
        print(f"\n  [{cat}]")
        for l in lines:
            print(l)
    
    if LIMITS_HIT:
        print(f"\n  [限流命中]")
        for name, count in sorted(LIMITS_HIT.items()):
            print(f"    {name}: {count} 次429")
    
    if FAILURES:
        print(f"\n  [失败详情] (前5):")
        for f in FAILURES[:5]:
            print(f"    - {f}")
    
    total_ok = sum(1 for v in RESULTS.values() for t in v if t is not None)
    total_fail = sum(1 for v in RESULTS.values() for t in v if t is None)
    total_429 = sum(LIMITS_HIT.values())
    print(f"\n  总计: {total_ok} 成功 / {total_fail} 失败 / {total_429} 被限流")
    print("="*65)

async def hit(session, name, method, path, json_data=None, expected_status=None):
    url = f"{BASE}{path}"
    t0 = time.time()
    try:
        if method == "GET":
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=20)) as r:
                body = await r.text()
                status = r.status
        else:
            async with session.post(url, json=json_data, timeout=aiohttp.ClientTimeout(total=20)) as r:
                body = await r.text()
                status = r.status
        ms = (time.time() - t0) * 1000
        if status == 429:
            LIMITS_HIT[name] += 1
            RESULTS[name].append(None)
            return status
        if expected_status and status != expected_status:
            RESULTS[name].append(None)
            FAILURES.append(f"{name}: status {status}, body={body[:200]}")
        else:
            RESULTS[name].append(ms)
        return status
    except Exception as e:
        RESULTS[name].append(None)
        FAILURES.append(f"{name}: {type(e).__name__}: {str(e)[:100]}")
        return None

# ──── 测试1: 基础API响应时间 (串行+限流安全) ────
async def test_api_baseline():
    log("▶ 基础API响应时间 (串行)")
    async with aiohttp.ClientSession() as session:
        for _ in range(10):
            await hit(session, "HEALTH /health", "GET", "/health", expected_status=200)
            await asyncio.sleep(0.5)
        for _ in range(5):
            await hit(session, "META /version", "GET", "/version", expected_status=200)
            await asyncio.sleep(0.5)
        for _ in range(5):
            await hit(session, "META /verify", "GET", "/verify", expected_status=200)
            await asyncio.sleep(1)
    log("  基础API测试完成")

# ──── 测试2: 股票API ────
async def test_stock_api():
    log("▶ 股票API测试")
    codes = ["600519", "000001", "300750", "601318", "000858", 
             "002594", "600036", "000333", "601012", "300059",
             "688981", "000002", "600900", "002415", "601899"]
    async with aiohttp.ClientSession() as session:
        for code in codes:
            await hit(session, "STOCK /api/stock", "GET", f"/api/stock/{code}")
            await asyncio.sleep(0.5)
    log("  股票API测试完成")

# ──── 测试3: 交易API ────
async def test_trade_api():
    log("▶ 交易API测试")
    async with aiohttp.ClientSession() as session:
        for _ in range(5):
            await hit(session, "TRADE /positions", "GET", "/api/trade/positions")
            await asyncio.sleep(0.5)
            await hit(session, "TRADE /orders", "GET", "/api/trade/orders")
            await asyncio.sleep(0.5)
            await hit(session, "TRADE /account", "GET", "/api/trade/account")
            await asyncio.sleep(0.5)
            await hit(session, "TRADE /risk-check", "GET", "/api/trade/risk-check")
            await asyncio.sleep(0.5)
    log("  交易API测试完成")

# ──── 测试4: 限流边界测试 ────
async def test_rate_limit_boundary():
    log("▶ 限流边界测试 (逐步加压到触发429)")
    async with aiohttp.ClientSession() as session:
        # 测试1: 安全速率 1qps 持续10秒
        t0 = time.time()
        count = 0
        while time.time() - t0 < 10:
            await hit(session, "LIMIT safe-1qps", "GET", "/health")
            count += 1
            await asyncio.sleep(1)
        log(f"  安全速率: {count}请求, 429={LIMITS_HIT.get('LIMIT safe-1qps', 0)}")
        
        # 测试2: 边界速率 2qps 持续10秒
        t0 = time.time()
        count = 0
        while time.time() - t0 < 10:
            await hit(session, "LIMIT edge-2qps", "GET", "/health")
            count += 1
            await asyncio.sleep(0.5)
        log(f"  边界速率: {count}请求, 429={LIMITS_HIT.get('LIMIT edge-2qps', 0)}")
        
        # 测试3: 超限速率 5qps 看限流是否生效
        t0 = time.time()
        count = 0
        while time.time() - t0 < 10:
            await hit(session, "LIMIT over-5qps", "GET", "/health")
            count += 1
            await asyncio.sleep(0.2)
        log(f"  超限速率: {count}请求, 429={LIMITS_HIT.get('LIMIT over-5qps', 0)}")
    log("  限流边界测试完成")

# ──── 测试5: WebSocket连接 ────
async def test_websocket():
    log("▶ WebSocket测试")
    # 获取token
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{BASE}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
            health = await r.json()
            ws_token = health.get("ws_token", "")
    
    if not ws_token:
        log("  ⚠ 无 ws_token，跳过")
        return

    connected = 0
    failed = 0
    msg_sent = 0
    msg_recv = 0
    latencies = []

    async def ws_worker(idx):
        nonlocal connected, failed, msg_sent, msg_recv
        url = f"ws://127.0.0.1:8000/ws?token={ws_token}"
        try:
            async with aiohttp.ClientSession() as s:
                async with s.ws_connect(url, timeout=aiohttp.ClientTimeout(total=5)) as ws:
                    connected += 1
                    # 发3条消息
                    for i in range(3):
                        t0 = time.time()
                        await ws.send_json({"type": "text_input", "payload": {"text": f"WS测试{idx}_{i}"}})
                        msg_sent += 1
                        await asyncio.sleep(0.3)
                        # 收响应
                        try:
                            resp = await asyncio.wait_for(ws.receive(), timeout=30)
                            ms = (time.time() - t0) * 1000
                            if resp.type == aiohttp.WSMsgType.TEXT:
                                msg_recv += 1
                                latencies.append(ms)
                        except asyncio.TimeoutError:
                            latencies.append(None)
        except Exception as e:
            failed += 1
            FAILURES.append(f"WS#{idx}: {type(e).__name__}: {str(e)[:80]}")

    # 串行连接5个
    for i in range(5):
        await ws_worker(i)
        await asyncio.sleep(0.5)
    
    if latencies:
        ok_lat = [l for l in latencies if l is not None]
        RESULTS["WS message latency"] = latencies
    
    log(f"  WS: connected={connected}, failed={failed}, sent={msg_sent}, recv={msg_recv}")
    log(f"  WS延迟: avg={sum(ok_lat)/len(ok_lat):.0f}ms" if ok_lat else "  WS: 无成功响应")

# ──── 测试6: 异常输入鲁棒性 ────
async def test_invalid_inputs():
    log("▶ 异常输入鲁棒性测试")
    async with aiohttp.ClientSession() as session:
        # 无效股票代码
        await hit(session, "FUZZ invalid-stock", "GET", "/api/stock/NOTREAL")
        await asyncio.sleep(0.5)
        # SQL注入
        await hit(session, "FUZZ sql-inject", "GET", "/api/stock/600519';DROP--")
        await asyncio.sleep(0.5)
        # 空body POST
        await hit(session, "FUZZ empty-order", "POST", "/api/trade/order", json_data={})
        await asyncio.sleep(0.5)
        # 超长代码
        await hit(session, "FUZZ long-code", "GET", f"/api/stock/{'A'*200}")
        await asyncio.sleep(0.5)
        # 特殊字符
        await hit(session, "FUZZ special-chars", "GET", "/api/stock/<script>alert(1)</script>")
        await asyncio.sleep(0.5)
        # 不存在的路径
        await hit(session, "FUZZ 404-path", "GET", "/api/nonexistent")
        await asyncio.sleep(0.5)
    log("  异常输入测试完成")

# ──── 测试7: 持续负载 (模拟真实用户) ────
async def test_realistic_load(duration=30):
    log(f"▶ 真实用户模拟 (duration={duration}s, ~1.5qps)")
    codes = ["600519", "000001", "300750", "601318"]
    async with aiohttp.ClientSession() as session:
        t0 = time.time()
        while time.time() - t0 < duration:
            action = random.random()
            if action < 0.3:
                await hit(session, "REAL /health", "GET", "/health")
            elif action < 0.6:
                await hit(session, "REAL /stock", "GET", f"/api/stock/{random.choice(codes)}")
            elif action < 0.8:
                await hit(session, "REAL /positions", "GET", "/api/trade/positions")
            else:
                await hit(session, "REAL /account", "GET", "/api/trade/account")
            await asyncio.sleep(random.uniform(0.3, 1.0))
    log("  真实用户模拟完成")

# ──── 测试8: 后端资源占用 ────
async def test_resource_monitor():
    log("▶ 后端资源监控")
    import subprocess
    # 找后端进程
    try:
        result = subprocess.run(
            ['powershell.exe', '-Command', 
             'Get-Process python* | ForEach-Object { $p=$_; try { $cmd=(Get-CimInstance Win32_Process -Filter "ProcessId=$($p.Id)").CommandLine; if($cmd -match "main.py|uvicorn") { "$($p.Id)|$($p.WorkingSet64/1MB)|$($p.CPU)|$cmd" } } catch {} }'],
            capture_output=True, text=True, timeout=10
        )
        for line in result.stdout.strip().split('\n'):
            if line.strip():
                parts = line.split('|')
                if len(parts) >= 3:
                    log(f"  后端进程 PID={parts[0]}, 内存={float(parts[1]):.0f}MB, CPU={parts[2]}s")
    except Exception as e:
        log(f"  资源监控失败: {e}")

async def main():
    print("="*65)
    print("  GBTxiaotudou 全栈压力测试 v2")
    print("  限流: HTTP 120/60s, WS 30/5s")
    print("="*65)
    t_start = time.time()
    
    # 检查后端
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE}/health", timeout=aiohttp.ClientTimeout(total=3)) as r:
                if r.status != 200:
                    print("❌ 后端未就绪")
                    return
                h = await r.json()
                print(f"  状态: {h.get('status')}, uptime: {h.get('uptime_seconds')}s")
                print(f"  LLM: {h.get('data_sources',{}).get('active_providers',0)} active")
                print(f"  模式: {h.get('trading_mode')}")
    except Exception as e:
        print(f"❌ 后端连接失败: {e}")
        return
    
    print()
    
    await test_api_baseline()
    await test_stock_api()
    await test_trade_api()
    await test_websocket()
    await test_invalid_inputs()
    await test_rate_limit_boundary()
    await test_realistic_load(duration=20)
    await test_resource_monitor()
    
    elapsed = time.time() - t_start
    print(f"\n  总耗时: {elapsed:.1f}s")
    report()

if __name__ == "__main__":
    asyncio.run(main())
