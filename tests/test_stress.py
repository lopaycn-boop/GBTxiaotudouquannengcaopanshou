"""Stress tests — SSIM high-volume, cache concurrency, verifier rapid-fire.

All tests use REAL computations, no shortcuts.
"""
from __future__ import annotations

import asyncio
import concurrent.futures
import time
from io import BytesIO

import numpy as np
import pytest
from PIL import Image

from potato.browser.verify import (
    BrowserVerifier,
    VerifyConfig,
    VerifyStatus,
    TradeVerification,
    _compute_ssim,
    _compute_pixel_diff,
)
from potato.cache import DecisionCache, get_decision_cache


# ═══════════════════════════════════════════════════════
# Stress 1: SSIM大量计算 (1000张图对)
# ═══════════════════════════════════════════════════════

class TestSSIMStress:
    def test_1000_ssim_computations(self):
        """连续计算1000次SSIM，验证无崩溃+结果合理"""
        img1 = Image.fromarray(np.random.randint(0, 255, (50, 50, 3), dtype=np.uint8))
        img2 = Image.fromarray(np.random.randint(0, 255, (50, 50, 3), dtype=np.uint8))

        scores = []
        start = time.time()
        for _ in range(1000):
            score = _compute_ssim(img1, img2)
            scores.append(score)
        elapsed = time.time() - start

        assert len(scores) == 1000
        assert all(-1.0 <= s <= 1.0 for s in scores), "SSIM out of range"
        avg = sum(scores) / len(scores)
        print(f"\n1000次SSIM计算: {elapsed:.2f}s, 平均{elapsed*1000/1000:.2f}ms/次, 平均SSIM={avg:.3f}")
        assert elapsed < 60, "1000次SSIM应在60s内完成"

    def test_large_image_ssim(self):
        """1920x1080大图SSIM计算"""
        img1 = Image.fromarray(np.full((1080, 1920, 3), 128, dtype=np.uint8))
        arr2 = np.full((1080, 1920, 3), 128, dtype=np.uint8)
        arr2[540:, :, :] = 200  # 下半部分变亮
        img2 = Image.fromarray(arr2)

        start = time.time()
        score = _compute_ssim(img1, img2)
        elapsed = time.time() - start

        print(f"\n1920x1080 SSIM: {score:.3f}, 耗时{elapsed:.3f}s")
        assert 0 < score < 1.0
        assert elapsed < 10, "大图SSIM应在10s内"

    def test_ssim_consistency(self):
        """相同输入多次计算结果一致"""
        img1 = Image.fromarray(np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8))
        img2 = Image.fromarray(np.random.randint(0, 255, (80, 80, 3), dtype=np.uint8))

        scores = [_compute_ssim(img1, img2) for _ in range(10)]
        # 所有结果应完全相同（确定性算法）
        assert all(abs(s - scores[0]) < 1e-10 for s in scores), \
            f"SSIM不一致: {scores}"


# ═══════════════════════════════════════════════════════
# Stress 2: 决策缓存并发+大量操作
# ═══════════════════════════════════════════════════════

class TestCacheStress:
    def test_10000_cache_operations(self):
        """10000次缓存读写"""
        cache = DecisionCache(ttl_seconds=60, max_size=500)

        start = time.time()
        for i in range(10000):
            news = [{"title": f"新闻{i % 200}"}]
            if i % 3 == 0:
                cache.put(news, f"portfolio{i % 50}", {}, "eastmoney", {"ok": True, "i": i})
            cache.get(news, f"portfolio{i % 50}", {}, "eastmoney")
        elapsed = time.time() - start

        stats = cache.stats()
        print(f"\n10000次缓存操作: {elapsed:.2f}s, {stats.summary()}")
        assert elapsed < 10, "10000次操作应在10s内"
        assert stats.size <= 500, "不应超过max_size"

    def test_cache_thread_safety(self):
        """多线程并发访问缓存"""
        cache = DecisionCache(ttl_seconds=60, max_size=1000)
        errors = []

        def worker(worker_id: int):
            try:
                for i in range(500):
                    news = [{"title": f"w{worker_id}n{i}"}]
                    cache.put(news, "", {}, "", {"ok": True, "wid": worker_id})
                    result = cache.get(news, "", {}, "")
                    if result is not None:
                        assert result.get("wid") == worker_id, "缓存值不匹配!"
            except Exception as e:
                errors.append(str(e))

        start = time.time()
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            futures = [pool.submit(worker, i) for i in range(8)]
            concurrent.futures.wait(futures)
        elapsed = time.time() - start

        stats = cache.stats()
        print(f"\n8线程x500次: {elapsed:.2f}s, {stats.summary()}, errors={len(errors)}")
        assert len(errors) == 0, f"线程安全错误: {errors}"

    def test_cache_rapid_ttl_expiry(self):
        """快速TTL过期—大批写入→等过期→验证全部miss"""
        cache = DecisionCache(ttl_seconds=0.2, max_size=1000)

        for i in range(100):
            cache.put([{"title": f"t{i}"}], "", {}, "", {"ok": True})

        stats_before = cache.stats()
        assert stats_before.size == 100

        time.sleep(0.3)

        misses = 0
        for i in range(100):
            if cache.get([{"title": f"t{i}"}], "", {}, "") is None:
                misses += 1

        stats_after = cache.stats()
        print(f"\nTTL过期测试: {misses}/100 miss, 清理后size={stats_after.size}")
        assert misses == 100, "过期后应全部miss"


# ═══════════════════════════════════════════════════════
# Stress 3: 验证器大量步骤
# ═══════════════════════════════════════════════════════

class TestVerifierStress:
    @pytest.mark.asyncio
    async def test_50_step_trade_verification(self):
        """50步交易验证（模拟完整复杂交易流程）"""
        verifier = BrowserVerifier(VerifyConfig(capture_screenshots=True, max_retries=1))

        step_count = 0
        async def execute_fn(step=None):
            nonlocal step_count
            step_count += 1

        call_idx = 0
        async def screenshot_fn():
            nonlocal call_idx
            # 每步产生不同的截图
            arr = np.full((50, 50, 3), (100 + call_idx * 5) % 256, dtype=np.uint8)
            call_idx += 1
            buf = BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            return buf.getvalue()

        async def page_text_fn():
            return "正常交易页面"

        start = time.time()
        result = await verifier.verify_trade(
            steps=[{"action": "click"} for _ in range(50)],
            execute_step_fn=execute_fn,
            screenshot_fn=screenshot_fn,
            page_text_fn=page_text_fn,
        )
        elapsed = time.time() - start

        print(f"\n50步验证: {result.passed_steps}通过, {result.failed_steps}失败, "
              f"{result.total_elapsed_ms:.0f}ms, 实际耗时{elapsed:.2f}s")
        assert result.total_steps == 50

    @pytest.mark.asyncio
    async def test_mixed_pass_fail_captcha(self):
        """混合正常+验证码步骤 — 验证码后立即停止"""
        verifier = BrowserVerifier(VerifyConfig(capture_screenshots=False))

        step_texts = ["正常", "正常", "请输入验证码继续", "这步不该执行"]
        text_idx = 0

        async def execute_fn(step=None):
            pass

        async def screenshot_fn():
            return None

        async def page_text_fn():
            nonlocal text_idx
            text = step_texts[min(text_idx, len(step_texts) - 1)]
            text_idx += 1
            return text

        result = await verifier.verify_trade(
            steps=[{"action": "click"} for _ in range(4)],
            execute_step_fn=execute_fn,
            screenshot_fn=screenshot_fn,
            page_text_fn=page_text_fn,
        )

        print(f"\n混合验证: {result.total_steps}步执行, anomalies={result.anomalies}")
        # 验证码应在第3步停止，不会执行第4步
        assert result.total_steps <= 3, f"验证码后应停止, 实际执行了{result.total_steps}步"
        assert any("captcha" in a for a in result.anomalies), "应检测到验证码"


# ═══════════════════════════════════════════════════════
# Stress 4: 全局缓存单例
# ═══════════════════════════════════════════════════════

class TestGlobalCache:
    def test_global_singleton(self):
        """全局缓存单例一致"""
        c1 = get_decision_cache()
        c2 = get_decision_cache()
        assert c1 is c2, "应返回同一实例"

    def test_global_cache_clear(self):
        """全局缓存清空"""
        cache = get_decision_cache()
        cache.put([{"title": "test"}], "", {}, "", {"ok": True})
        count = cache.clear()
        assert count >= 0
        stats = cache.stats()
        assert stats.size == 0


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short", "-s"])
