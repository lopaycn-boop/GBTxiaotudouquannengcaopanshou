#!/usr/bin/env python3
"""GBTxiaotudou 全栈压力测试"""
import asyncio
import aiohttp
import time
import json
import sys
import random
from collections import defaultdict

BASE = "http://127.0.0.1:8000"
RESULTS = defaultdict(list)
FAILURES = []

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def report():
    print("\n" + "="*60)
    print("  全栈压力测试报告")
    print("="*60)
    for name, times in sorted(RESULTS.items()):
        if not times:
            continue
        ok = [t for t in times if t is not None]
        fail = len(times) - len(ok)
        if ok:
            avg = sum(ok)/len(ok)
            mx = max(ok)
            mn = min(ok)
            p95 = sorted(ok)[int(len(ok)*0.95)] if len(ok) > 1 else ok[0]
            print(f"  {name:30s} | n={len(ok):3d} fail={fail:2d} | avg={avg:.0f}ms p95={p95:.0f}ms max={mx:.0f}ms min={mn:.0f}ms")
        else:
            print(f"  {name:30s} | ALL FAILED ({fail})")
    if FAILURES:
        print(f"\n  失败详情 (前10):")
        for f in FAILURES[:10]:
            print(f"    - {f}")
    total_ok = sum(1 for v in RESULTS.values() for t in v if t is not None)
    total_fail = sum(1 for v in RESULTS.values() for t in v if t is None)
    print(f"\n  总计: {total_ok} 成功 / {total_fail} 失败")
    print("="*60)

async def hit(session, name, method, path, json_data=None, expected_status=200):
    url = f"{BASE}{path}"
    t0 = time.time()
    try:
        if method == "GET":
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=15)) as r:
                body = await r.text()
                status = r.status
        else:
            async with session.post(url, json=json_data, timeout=aiohttp.ClientTimeout(total=15)) as r:
                body = await r.text()
                status = r.status
        ms = (time.time() - t0) * 1000
        if status != expected_status:
            RESULTS[name].append(None)
            FAILURES.append(f"{name}: status {status} != {expected_status}, body={body[:200]}")
        else:
            RESULTS[name].append(ms)
    except Exception as e:
        RESULTS[name].append(None)
        FAILURES.append(f"{name}: {type(e).__name__}: {e}")

# ──── 测试1: HTTP API 并发 ────
async def test_http_api(concurrency=50, rounds=3):
    log(f"▶ HTTP API 并发测试 (concurrency={concurrency}, rounds={rounds})")
    async with aiohttp.ClientSession() as session:
        for r in range(rounds):
            # health
            await asyncio.gather(*[hit(session, "GET /health", "GET", "/health") for _ in range(concurrency)])
            # version
            await asyncio.gather(*[hit(session, "GET /version", "GET", "/version") for _ in range(concurrency)])
            # verify
            await asyncio.gather(*[hit(session, "GET /verify", "GET", "/verify") for _ in range(concurrency)])
            # stock API - 多只股票并发
            codes = ["600519","000001","300750","601318","000858","002594","600036","000333","601012","300059"]
            tasks = [hit(session, f"GET /api/stock/{{code}}", "GET", f"/api/stock/{random.choice(codes)}") for _ in range(concurrency)]
            await asyncio.gather(*tasks)
            log(f"  round {r+1}/{rounds} done")

# ──── 测试2: WebSocket 连接压力 ────
async def test_ws_stress(n_connections=20, duration=10):
    log(f"▶ WebSocket 连接压力 (n={n_connections}, duration={duration}s)")
    # 先获取 ws_token
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{BASE}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
            health = await r.json()
            ws_token = health.get("ws_token", "")
    
    if not ws_token:
        log("  ⚠ 无法获取 ws_token，跳过WS测试")
        return

    connected = 0
    failed = 0
    messages_sent = 0
    messages_recv = 0

    async def ws_worker(idx):
        nonlocal connected, failed, messages_sent, messages_recv
        url = f"ws://127.0.0.1:8000/ws?token={ws_token}"
        try:
            async with aiohttp.ClientSession() as session:
                async with session.ws_connect(url, timeout=aiohttp.ClientTimeout(total=5)) as ws:
                    connected += 1
                    # 发送几条消息
                    for i in range(3):
                        await ws.send_json({"type": "text_input", "payload": {"text": f"压力测试消息{idx}_{i}"}})
                        messages_sent += 1
                        await asyncio.sleep(0.5)
                    # 等待接收
                    t0 = time.time()
                    while time.time() - t0 < duration / 3:
                        try:
                            msg = await asyncio.wait_for(ws.receive(), timeout=2)
                            if msg.type == aiohttp.WSMsgType.TEXT:
                                messages_recv += 1
                            elif msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                                break
                        except asyncio.TimeoutError:
                            break
        except Exception as e:
            failed += 1
            FAILURES.append(f"WS#{idx}: {type(e).__name__}: {str(e)[:100]}")

    # 分批连接，每批5个
    for batch_start in range(0, n_connections, 5):
        batch_end = min(batch_start + 5, n_connections)
        await asyncio.gather(*[ws_worker(i) for i in range(batch_start, batch_end)])
        await asyncio.sleep(1)
    
    RESULTS["WS_connect"] = [1.0 if connected > 0 else None] * connected
    log(f"  WS: connected={connected}, failed={failed}, sent={messages_sent}, recv={messages_recv}")

# ──── 测试3: 交易API压力 ────
async def test_trade_api(concurrency=20):
    log(f"▶ 交易API压力测试 (concurrency={concurrency})")
    async with aiohttp.ClientSession() as session:
        # 查询持仓
        await asyncio.gather(*[hit(session, "GET /api/trade/positions", "GET", "/api/trade/positions") for _ in range(concurrency)])
        # 查询订单
        await asyncio.gather(*[hit(session, "GET /api/trade/orders", "GET", "/api/trade/orders") for _ in range(concurrency)])
        # 查询账户
        await asyncio.gather(*[hit(session, "GET /api/trade/account", "GET", "/api/trade/account") for _ in range(concurrency)])
        # 风控检查
        await asyncio.gather(*[hit(session, "GET /api/trade/risk-check", "GET", "/api/trade/risk-check") for _ in range(concurrency)])

# ──── 测试4: 持续高频请求 ────
async def test_sustained_load(qps=30, duration=15):
    log(f"▶ 持续高频请求 (qps={qps}, duration={duration}s)")
    async with aiohttp.ClientSession() as session:
        codes = ["600519","000001","300750","601318","000858"]
        t0 = time.time()
        total = 0
        while time.time() - t0 < duration:
            batch = []
            for _ in range(qps):
                code = random.choice(codes)
                batch.append(hit(session, "sustained /api/stock", "GET", f"/api/stock/{code}"))
                batch.append(hit(session, "sustained /health", "GET", "/health"))
            await asyncio.gather(*batch)
            total += len(batch)
            await asyncio.sleep(1)
        log(f"  sent {total} requests in {duration}s")

# ──── 测试5: 大消息WebSocket ────
async def test_ws_large_message():
    log("▶ WebSocket 大消息测试")
    async with aiohttp.ClientSession() as session:
        async with session.get(f"{BASE}/health", timeout=aiohttp.ClientTimeout(total=5)) as r:
            health = await r.json()
            ws_token = health.get("ws_token", "")
    if not ws_token:
        log("  ⚠ 无 ws_token，跳过")
        return

    url = f"ws://127.0.0.1:8000/ws?token={ws_token}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.ws_connect(url, timeout=aiohttp.ClientTimeout(total=10)) as ws:
                # 正常消息
                t0 = time.time()
                await ws.send_json({"type": "text_input", "payload": {"text": "正常消息测试"}})
                msg = await asyncio.wait_for(ws.receive(), timeout=30)
                ms = (time.time() - t0) * 1000
                RESULTS["WS_normal_msg"].append(ms if msg.type == aiohttp.WSMsgType.TEXT else None)
                
                # 边界消息 (接近64KB限制)
                big_text = "大消息测试" * 5000  # ~15KB
                t0 = time.time()
                await ws.send_json({"type": "text_input", "payload": {"text": big_text}})
                msg = await asyncio.wait_for(ws.receive(), timeout=30)
                ms = (time.time() - t0) * 1000
                RESULTS["WS_large_msg"].append(ms if msg.type == aiohttp.WSMsgType.TEXT else None)
                
                # 超限消息 (>65KB)
                huge_text = "X" * 70000
                t0 = time.time()
                await ws.send_str(huge_text[:65536])
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=5)
                    ms = (time.time() - t0) * 1000
                    RESULTS["WS_oversize_msg"].append(ms)
                except:
                    RESULTS["WS_oversize_msg"].append(None)
                    
        log("  大消息测试完成")
    except Exception as e:
        FAILURES.append(f"WS_large: {type(e).__name__}: {str(e)[:100]}")
        log(f"  ⚠ WS大消息测试异常: {e}")

# ──── 测试6: 异常输入 ────
async def test_invalid_inputs(concurrency=10):
    log("▶ 异常输入测试")
    async with aiohttp.ClientSession() as session:
        # 无效股票代码
        await asyncio.gather(*[hit(session, "invalid stock code", "GET", "/api/stock/INVALID123") for _ in range(concurrency)])
        # 空body POST
        await asyncio.gather(*[hit(session, "empty POST /api/trade/order", "POST", "/api/trade/order", json_data={}) for _ in range(concurrency)])
        # 超长路径
        await asyncio.gather(*[hit(session, "long path", "GET", f"/api/stock/{'A'*200}") for _ in range(concurrency)])
        # SQL注入尝试
        await asyncio.gather(*[hit(session, "SQL injection", "GET", "/api/stock/600519'; DROP TABLE--") for _ in range(concurrency)])

async def main():
    print("="*60)
    print("  GBTxiaotudou 全栈压力测试")
    print("="*60)
    t_start = time.time()
    
    # 先检查后端是否存活
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(f"{BASE}/health", timeout=aiohttp.ClientTimeout(total=3)) as r:
                if r.status != 200:
                    print("❌ 后端未就绪，退出")
                    return
                h = await r.json()
                print(f"  后端状态: {h.get('status')}, uptime: {h.get('uptime_seconds')}s")
                print(f"  LLM providers: {h.get('data_sources',{}).get('active_providers',0)} active")
                print(f"  Trading mode: {h.get('trading_mode')}")
    except Exception as e:
        print(f"❌ 无法连接后端: {e}")
        return
    
    print()
    
    # 依次执行测试
    await test_http_api(concurrency=50, rounds=3)
    await test_trade_api(concurrency=20)
    await test_sustained_load(qps=20, duration=10)
    await test_invalid_inputs(concurrency=10)
    await test_ws_large_message()
    await test_ws_stress(n_connections=15, duration=8)
    
    # 报告
    elapsed = time.time() - t_start
    print(f"\n  总耗时: {elapsed:.1f}s")
    report()

if __name__ == "__main__":
    asyncio.run(main())
