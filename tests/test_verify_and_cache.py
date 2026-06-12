"""Tests for browser verify, decision cache, and trading pipeline.

All tests use REAL calculations — no hardcoded confidence, no fake data.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import time
from io import BytesIO
from unittest.mock import AsyncMock, MagicMock

import numpy as np
import pytest
from PIL import Image


# ═══════════════════════════════════════════════════════
# Test 1: SSIM计算 (真实，非硬编码)
# ═══════════════════════════════════════════════════════

def _make_image(color: int, size: tuple = (100, 100)) -> Image.Image:
    """创建纯色测试图像"""
    arr = np.full((*size, 3), color, dtype=np.uint8)
    return Image.fromarray(arr)


def _make_noisy_image(base_color: int, noise: int = 10, size: tuple = (100, 100)) -> Image.Image:
    """创建带噪声的图像"""
    arr = np.full((*size, 3), base_color, dtype=np.uint8)
    noise_arr = np.random.randint(-noise, noise, arr.shape, dtype=np.int16)
    arr = np.clip(arr.astype(np.int16) + noise_arr, 0, 255).astype(np.uint8)
    return Image.fromarray(arr)


class TestSSIM:
    """SSIM计算测试 — 验证真实计算结果"""

    def test_identical_images_ssim_1(self):
        """相同图像 → SSIM接近1.0"""
        from potato.browser.verify import _compute_ssim
        img = _make_image(128)
        score = _compute_ssim(img, img)
        assert score > 0.99, f"相同图像SSIM应为~1.0, 实际={score}"

    def test_completely_different_ssim_low(self):
        """完全不同图像 → SSIM低"""
        from potato.browser.verify import _compute_ssim
        img1 = _make_image(0)      # 全黑
        img2 = _make_image(255)    # 全白
        score = _compute_ssim(img1, img2)
        assert score < 0.3, f"黑白图像SSIM应很低, 实际={score}"

    def test_slight_noise_ssim_high(self):
        """轻微噪声 → SSIM高但不等于1.0"""
        from potato.browser.verify import _compute_ssim
        img1 = _make_image(128)
        img2 = _make_noisy_image(128, noise=5)
        score = _compute_ssim(img1, img2)
        assert 0.8 < score < 1.0, f"轻微噪声SSIM应为0.8~1.0, 实际={score}"

    def test_real_world_change_ssim_moderate(self):
        """半边改变 → SSIM中等"""
        from potato.browser.verify import _compute_ssim
        arr1 = np.full((100, 100, 3), 128, dtype=np.uint8)
        arr2 = arr1.copy()
        arr2[:50, :, :] = 50  # 上半部分变暗
        score = _compute_ssim(Image.fromarray(arr1), Image.fromarray(arr2))
        assert 0.5 < score < 0.95, f"半边变化SSIM应为0.3~0.8, 实际={score}"

    def test_different_sizes_handled(self):
        """不同尺寸 → 自动缩放，不报错"""
        from potato.browser.verify import _compute_ssim
        img1 = _make_image(128, (100, 100))
        img2 = _make_image(128, (200, 200))
        score = _compute_ssim(img1, img2)
        assert score > 0.9, f"同色不同尺寸SSIM应接近1.0, 实际={score}"


# ═══════════════════════════════════════════════════════
# Test 2: 像素差异计算 (真实)
# ═══════════════════════════════════════════════════════

class TestPixelDiff:
    def test_identical_no_diff(self):
        """相同图像 → 0变化"""
        from potato.browser.verify import _compute_pixel_diff
        img = _make_image(128)
        pixels, pct = _compute_pixel_diff(img, img)
        assert pixels == 0, f"相同图像变化像素应为0, 实际={pixels}"
        assert pct == 0.0, f"相同图像变化率应为0, 实际={pct}"

    def test_half_changed(self):
        """半边改变 → ~50%变化"""
        from potato.browser.verify import _compute_pixel_diff
        arr1 = np.full((100, 100, 3), 128, dtype=np.uint8)
        arr2 = arr1.copy()
        arr2[:50, :, :] = 50
        pixels, pct = _compute_pixel_diff(Image.fromarray(arr1), Image.fromarray(arr2))
        assert 0.4 < pct < 0.6, f"半边变化率应~50%, 实际={pct:.1%}"


# ═══════════════════════════════════════════════════════
# Test 3: 异常检测 (关键词匹配)
# ═══════════════════════════════════════════════════════

class TestAnomalyDetection:
    def test_captcha_detected(self):
        """验证码检测"""
        from potato.browser.verify import _detect_anomaly_from_text
        anomaly, matched = _detect_anomaly_from_text("请输入验证码继续操作")
        assert anomaly == "captcha", f"应检测到验证码, 实际={anomaly}"
        assert len(matched) > 0

    def test_popup_detected(self):
        """弹窗检测"""
        from potato.browser.verify import _detect_anomaly_from_text
        anomaly, matched = _detect_anomaly_from_text("风险提示：投资有风险，请确认")
        assert anomaly == "popup", f"应检测到弹窗, 实际={anomaly}"

    def test_normal_page_no_anomaly(self):
        """正常页面无异常"""
        from potato.browser.verify import _detect_anomaly_from_text
        anomaly, matched = _detect_anomaly_from_text("贵州茅台 当前价格1523.50 涨幅+0.82%")
        assert anomaly == "", f"正常页面不应有异常, 实际={anomaly}"

    def test_captcha_priority_over_popup(self):
        """验证码优先级高于弹窗"""
        from potato.browser.verify import _detect_anomaly_from_text
        anomaly, _ = _detect_anomaly_from_text("请输入验证码 确认操作")
        assert anomaly == "captcha", "验证码应优先于弹窗"


# ═══════════════════════════════════════════════════════
# Test 4: 决策缓存 (真实hash+TTL)
# ═══════════════════════════════════════════════════════

class TestDecisionCache:
    def test_cache_miss_first_time(self):
        """首次查询未命中"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=60)
        result = cache.get([], "", {}, "")
        assert result is None, "首次查询应为None"

    def test_cache_put_then_get(self):
        """写入后命中"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=60)
        news = [{"title": "茅台涨价"}]
        decision = {"ok": True, "analysis": {"action": "BUY"}}
        cache.put(news, "portfolio", {}, "eastmoney", decision)
        result = cache.get(news, "portfolio", {}, "eastmoney")
        assert result is not None
        assert result["ok"] is True

    def test_cache_different_news_miss(self):
        """不同新闻未命中"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=60)
        news1 = [{"title": "茅台涨价"}]
        news2 = [{"title": "比亚迪跌了"}]
        cache.put(news1, "", {}, "", {"ok": True})
        result = cache.get(news2, "", {}, "")
        assert result is None, "不同新闻应cache miss"

    def test_cache_ttl_expired(self):
        """TTL过期"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=0.1)  # 100ms过期
        cache.put([], "", {}, "", {"ok": True})
        time.sleep(0.2)
        result = cache.get([], "", {}, "")
        assert result is None, "过期后应cache miss"

    def test_cache_stats(self):
        """统计准确"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=60)
        cache.get([], "", {}, "")  # miss
        cache.put([], "", {}, "", {"ok": True})
        cache.get([], "", {}, "")  # hit
        stats = cache.stats()
        assert stats.hits == 1, f"hits应为1, 实际={stats.hits}"
        assert stats.misses == 1, f"misses应为1, 实际={stats.misses}"
        assert 0.4 < stats.hit_rate < 0.6, f"命中率应~50%, 实际={stats.hit_rate}"

    def test_cache_max_size_eviction(self):
        """容量超限淘汰"""
        from potato.cache import DecisionCache
        cache = DecisionCache(ttl_seconds=60, max_size=2)
        cache.put([{"title": "a"}], "", {}, "", {"ok": 1})
        cache.put([{"title": "b"}], "", {}, "", {"ok": 2})
        cache.put([{"title": "c"}], "", {}, "", {"ok": 3})
        assert cache.stats().size <= 2, "容量应不超过max_size"


# ═══════════════════════════════════════════════════════
# Test 5: 操作验证闭环 (集成)
# ═══════════════════════════════════════════════════════

class TestBrowserVerifier:
    @pytest.mark.asyncio
    async def test_verify_step_pass(self):
        """操作成功且页面变化 → PASS"""
        from potato.browser.verify import BrowserVerifier, VerifyConfig, VerifyStatus

        verifier = BrowserVerifier(VerifyConfig(capture_screenshots=True))

        call_count = 0
        async def execute_fn():
            nonlocal call_count
            call_count += 1

        async def screenshot_fn():
            # 返回变化的截图
            if call_count == 0:
                arr = np.full((50, 50, 3), 100, dtype=np.uint8)
            else:
                arr = np.full((50, 50, 3), 200, dtype=np.uint8)
            buf = BytesIO()
            Image.fromarray(arr).save(buf, format="PNG")
            return buf.getvalue()

        async def page_text_fn():
            return "正常页面内容"

        result = await verifier.verify_step(
            step_action="click",
            execute_fn=execute_fn,
            screenshot_fn=screenshot_fn,
            page_text_fn=page_text_fn,
            step_index=0,
        )
        assert result.status == VerifyStatus.PASS, f"应PASS, 实际={result.status}"
        assert result.ssim_score < 0.98, f"变化页面SSIM应<0.98, 实际={result.ssim_score}"
        assert result.change_pct > 0.001, f"变化页面change_pct应>0, 实际={result.change_pct}"

    @pytest.mark.asyncio
    async def test_verify_step_captcha(self):
        """验证码页面 → FAIL_CAPTCHA"""
        from potato.browser.verify import BrowserVerifier, VerifyConfig, VerifyStatus

        verifier = BrowserVerifier(VerifyConfig(capture_screenshots=False))

        async def execute_fn():
            pass

        async def screenshot_fn():
            return None

        async def page_text_fn():
            return "请输入验证码继续"

        result = await verifier.verify_step(
            step_action="click",
            execute_fn=execute_fn,
            screenshot_fn=screenshot_fn,
            page_text_fn=page_text_fn,
            step_index=0,
        )
        assert result.status == VerifyStatus.FAIL_CAPTCHA, f"应FAIL_CAPTCHA, 实际={result.status}"

    @pytest.mark.asyncio
    async def test_verify_step_no_change(self):
        """页面无变化 → FAIL_NO_CHANGE"""
        from potato.browser.verify import BrowserVerifier, VerifyConfig, VerifyStatus

        verifier = BrowserVerifier(VerifyConfig(capture_screenshots=True))

        async def execute_fn():
            pass

        # 相同截图
        arr = np.full((50, 50, 3), 128, dtype=np.uint8)
        buf = BytesIO()
        Image.fromarray(arr).save(buf, format="PNG")
        shot = buf.getvalue()

        async def screenshot_fn():
            return shot

        async def page_text_fn():
            return "正常"

        result = await verifier.verify_step(
            step_action="click",
            execute_fn=execute_fn,
            screenshot_fn=screenshot_fn,
            page_text_fn=page_text_fn,
            step_index=0,
        )
        assert result.status == VerifyStatus.FAIL_NO_CHANGE, f"应FAIL_NO_CHANGE, 实际={result.status}"


# ═══════════════════════════════════════════════════════
# Test 6: 风控验证 (真实规则)
# ═══════════════════════════════════════════════════════

class TestRiskValidation:
    def test_risk_not_confirmed_blocks_all(self):
        """Rule 0: 未确认风控参数 → 所有交易被拒"""
        from potato.risk import RiskValidator, RiskState, TradeRequest
        from decimal import Decimal

        validator = RiskValidator()
        state = RiskState(date="2025-01-01")
        trade = TradeRequest(
            action="BUY", symbol="600519", name="贵州茅台",
            price=Decimal("1500"), quantity=100,
            amount_cny=Decimal("150000"), confidence=Decimal("0.9"),
            reasoning="test",
        )
        verdict = validator.validate_trade(trade, state)
        assert not verdict.allowed, "未确认风控应拒绝交易"
        assert "RISK_NOT_CONFIRMED" in verdict.reason

    def test_circuit_breaker_blocks(self):
        """熔断机制"""
        from potato.risk import RiskValidator, RiskState, TradeRequest
        from decimal import Decimal

        prefs = MagicMock()
        prefs.get_all.return_value = {"risk_confirmed": True}
        validator = RiskValidator(user_prefs=prefs)
        state = RiskState(date="2025-01-01", circuit_breaker=True)
        trade = TradeRequest(
            action="BUY", symbol="600519", name="贵州茅台",
            price=Decimal("100"), quantity=100,
            amount_cny=Decimal("10000"), confidence=Decimal("0.9"),
            reasoning="test",
        )
        verdict = validator.validate_trade(trade, state)
        assert not verdict.allowed, "熔断应拒绝交易"

    def test_st_stock_blocked(self):
        """ST股被拒"""
        from potato.risk import RiskValidator, RiskState, TradeRequest
        from decimal import Decimal

        prefs = MagicMock()
        prefs.get_all.return_value = {"risk_confirmed": True}
        validator = RiskValidator(user_prefs=prefs)
        state = RiskState(date="2025-01-01")
        trade = TradeRequest(
            action="BUY", symbol="000001", name="ST某某",
            price=Decimal("5"), quantity=100,
            amount_cny=Decimal("500"), confidence=Decimal("0.9"),
            reasoning="test",
        )
        verdict = validator.validate_trade(trade, state)
        assert not verdict.allowed, "ST股应被拒"
        assert "RESTRICTED" in verdict.reason


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
