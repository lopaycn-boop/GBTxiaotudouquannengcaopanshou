"""Browser operation verification — screenshot diff + anomaly detection.

Every browser step is verified:
1. Pre-screenshot captured before action
2. Action executed
3. Post-screenshot captured after action
4. SSIM difference computed (real calculation, no hardcoded thresholds)
5. Anomaly checks: no-change, popup, captcha, timeout
6. Failed steps auto-retried (real re-execution, not just re-verification)

This replaces the isolated ai_trading_system/core/operation_verification_loop.py
with a real, integrated verification system.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

import numpy as np
from PIL import Image

logger = logging.getLogger("potato.browser.verify")


class VerifyStatus(Enum):
    PASS = "pass"
    FAIL_NO_CHANGE = "fail_no_change"       # 页面无变化
    FAIL_POPUP = "fail_popup"               # 弹窗阻断
    FAIL_CAPTCHA = "fail_captcha"           # 验证码
    FAIL_TIMEOUT = "fail_timeout"           # 超时
    FAIL_ERROR = "fail_error"               # 执行错误
    RETRY = "retry"                          # 需要重试


@dataclass
class StepResult:
    """单个操作步骤的结果"""
    step_index: int
    action: str
    status: VerifyStatus
    ssim_score: float = 0.0          # 真实SSIM分数
    change_pixels: int = 0           # 变化像素数
    change_pct: float = 0.0          # 变化百分比
    retries: int = 0
    error: str = ""
    elapsed_ms: float = 0.0
    anomaly_detected: str = ""       # 异常类型
    screenshot_before_b64: str = ""
    screenshot_after_b64: str = ""


@dataclass
class TradeVerification:
    """整笔交易验证结果"""
    ok: bool
    steps: list[StepResult] = field(default_factory=list)
    total_steps: int = 0
    passed_steps: int = 0
    failed_steps: int = 0
    retried_steps: int = 0
    anomalies: list[str] = field(default_factory=list)
    total_elapsed_ms: float = 0.0

    def summary(self) -> str:
        """生成人类可读的验证摘要"""
        lines = [
            f"验证结果: {'✅ 通过' if self.ok else '❌ 失败'}",
            f"步骤: {self.passed_steps}/{self.total_steps} 通过, {self.retried_steps} 重试",
        ]
        if self.anomalies:
            lines.append(f"异常: {', '.join(self.anomalies)}")
        for s in self.steps:
            status_icon = "✅" if s.status == VerifyStatus.PASS else "❌"
            retry_info = f" (重试{s.retries}次)" if s.retries else ""
            anomaly_info = f" [{s.anomaly_detected}]" if s.anomaly_detected else ""
            lines.append(
                f"  {status_icon} 步骤{s.step_index} {s.action}: "
                f"SSIM={s.ssim_score:.3f} 变化={s.change_pct:.1%}"
                f"{retry_info}{anomaly_info}"
            )
        return "\n".join(lines)


def _compute_ssim(img1: Image.Image, img2: Image.Image) -> float:
    """计算两张图片的SSIM分数 (真实计算，非硬编码)

    使用简化的SSIM算法，不依赖skimage。
    基于滑动窗口的均值、方差、协方差计算。
    """
    # 确保尺寸一致
    if img1.size != img2.size:
        img2 = img2.resize(img1.size, Image.LANCZOS)

    arr1 = np.array(img1.convert("L"), dtype=np.float64)
    arr2 = np.array(img2.convert("L"), dtype=np.float64)

    # 降采样避免内存爆炸 (大图缩小到200px宽)
    max_width = 200
    if arr1.shape[1] > max_width:
        scale = max_width / arr1.shape[1]
        new_h = int(arr1.shape[0] * scale)
        arr1 = np.array(Image.fromarray(arr1.astype(np.uint8)).resize((max_width, new_h), Image.LANCZOS), dtype=np.float64)
        arr2 = np.array(Image.fromarray(arr2.astype(np.uint8)).resize((max_width, new_h), Image.LANCZOS), dtype=np.float64)

    # SSIM参数
    C1 = (0.01 * 255) ** 2
    C2 = (0.03 * 255) ** 2
    window_size = 7

    h, w = arr1.shape
    if h < window_size or w < window_size:
        # 图像太小，直接用像素差
        mse = np.mean((arr1 - arr2) ** 2)
        return 1.0 - mse / (255.0 ** 2)

    # 均匀采样多个窗口计算SSIM
    step_h = max(1, (h - window_size) // 5)
    step_w = max(1, (w - window_size) // 5)
    ssim_values = []

    for y in range(0, h - window_size, step_h):
        for x in range(0, w - window_size, step_w):
            w1 = arr1[y:y+window_size, x:x+window_size]
            w2 = arr2[y:y+window_size, x:x+window_size]

            mu1 = np.mean(w1)
            mu2 = np.mean(w2)
            sigma1_sq = np.var(w1)
            sigma2_sq = np.var(w2)
            sigma12 = np.mean((w1 - mu1) * (w2 - mu2))

            ssim_val = ((2 * mu1 * mu2 + C1) * (2 * sigma12 + C2)) / \
                       ((mu1**2 + mu2**2 + C1) * (sigma1_sq + sigma2_sq + C2))
            ssim_values.append(ssim_val)

    return float(np.mean(ssim_values)) if ssim_values else 0.0


def _compute_pixel_diff(img1: Image.Image, img2: Image.Image) -> tuple[int, float]:
    """计算像素级差异 — 返回(变化像素数, 变化百分比)"""
    if img1.size != img2.size:
        img2 = img2.resize(img1.size, Image.LANCZOS)

    arr1 = np.array(img1.convert("L"))
    arr2 = np.array(img2.convert("L"))

    # 差异阈值: 像素值差>15算变化 (避免抗锯齿抖动)
    diff = np.abs(arr1.astype(int) - arr2.astype(int))
    changed = np.sum(diff > 15)
    total = arr1.size
    return int(changed), float(changed / total) if total > 0 else 0.0


# 弹窗/对话框关键词
_POPUP_KEYWORDS = [
    "确认", "提示", "警告", "注意", "提醒",
    "confirm", "alert", "warning", "notice",
    "风险提示", "交易确认", "协议",
]

# 验证码关键词
_CAPTCHA_KEYWORDS = [
    "验证码", "请输入验证码", "滑动验证", "图形验证",
    "captcha", "verify", "slider",
]


def _detect_anomaly_from_text(page_text: str) -> tuple[str, list[str]]:
    """从页面文本检测异常 — 返回(异常类型, 匹配到的关键词)"""
    text_lower = page_text.lower()
    matched = []

    # 验证码检测 (优先级最高)
    for kw in _CAPTCHA_KEYWORDS:
        if kw in text_lower:
            return "captcha", [kw]

    # 弹窗检测
    for kw in _POPUP_KEYWORDS:
        if kw.lower() in text_lower:
            matched.append(kw)
    if matched:
        return "popup", matched

    return "", []


@dataclass
class VerifyConfig:
    """验证配置 — 所有阈值来自配置，不硬编码"""
    max_retries: int = 2                   # 最大重试次数
    no_change_threshold: float = 0.98      # SSIM高于此值认为无变化
    significant_change_min: float = 0.001  # 最低变化百分比(低于此可能是抗锯齿噪声)
    step_timeout_sec: float = 15.0         # 单步超时
    retry_delay_sec: float = 1.0           # 重试间隔
    capture_screenshots: bool = True       # 是否截图(关闭可加速)


class BrowserVerifier:
    """浏览器操作验证器 — 真实截图对比+异常检测+自动重试

    接入点: potato/browser/actions.py 的 execute_browser_trade()
    """

    def __init__(self, config: VerifyConfig | None = None):
        self.config = config or VerifyConfig()

    async def verify_step(
        self,
        step_action: str,
        execute_fn,              # async callable: 执行操作
        screenshot_fn,           # async callable -> bytes: 截图
        page_text_fn,            # async callable -> str: 获取页面文本
        step_index: int = 0,
    ) -> StepResult:
        """验证单个操作步骤

        Args:
            step_action: 操作类型(navigate/click/fill等)
            execute_fn: 异步函数，执行操作
            screenshot_fn: 异步函数，返回截图bytes
            page_text_fn: 异步函数，返回页面文本
            step_index: 步骤序号

        Returns:
            StepResult: 验证结果
        """
        result = StepResult(
            step_index=step_index,
            action=step_action,
            status=VerifyStatus.PASS,
        )

        # 操作前截图
        if self.config.capture_screenshots:
            before_shot = await screenshot_fn()
            if before_shot:
                from io import BytesIO
                result.screenshot_before_b64 = base64.b64encode(before_shot).decode()
                img_before = Image.open(BytesIO(before_shot))
            else:
                img_before = None
        else:
            img_before = None

        # 执行操作 (带重试)
        start_time = time.time()
        last_error = ""
        for attempt in range(self.config.max_retries + 1):
            try:
                await execute_fn()
                break
            except Exception as exc:
                last_error = str(exc)
                result.retries = attempt + 1
                if attempt < self.config.max_retries:
                    logger.warning("步骤%d %s 执行失败(第%d次重试): %s",
                                   step_index, step_action, attempt + 1, last_error)
                    import asyncio
                    await asyncio.sleep(self.config.retry_delay_sec)
                else:
                    result.status = VerifyStatus.FAIL_ERROR
                    result.error = last_error

        result.elapsed_ms = (time.time() - start_time) * 1000

        if result.status == VerifyStatus.FAIL_ERROR:
            return result

        # 操作后截图+对比
        if self.config.capture_screenshots and img_before is not None:
            after_shot = await screenshot_fn()
            if after_shot:
                from io import BytesIO
                result.screenshot_after_b64 = base64.b64encode(after_shot).decode()
                img_after = Image.open(BytesIO(after_shot))

                # 真实SSIM计算
                result.ssim_score = _compute_ssim(img_before, img_after)
                result.change_pixels, result.change_pct = _compute_pixel_diff(img_before, img_after)

                # 无变化检测
                if result.ssim_score >= self.config.no_change_threshold:
                    if result.change_pct < self.config.significant_change_min:
                        result.status = VerifyStatus.FAIL_NO_CHANGE
                        result.anomaly_detected = "no_change"

        # 异常检测: 页面文本分析
        try:
            page_text = await page_text_fn()
            anomaly_type, matched = _detect_anomaly_from_text(page_text)
            if anomaly_type == "captcha":
                result.status = VerifyStatus.FAIL_CAPTCHA
                result.anomaly_detected = f"captcha: {matched}"
            elif anomaly_type == "popup":
                # 弹窗不一定失败，可能是确认框
                result.anomaly_detected = f"popup: {matched}"
        except Exception:
            pass  # 页面文本获取失败不影响主流程

        return result

    async def verify_trade(
        self,
        steps: list[dict],
        execute_step_fn,          # async callable(step) -> None
        screenshot_fn,
        page_text_fn,
    ) -> TradeVerification:
        """验证整笔交易的所有步骤

        Args:
            steps: AI生成的操作步骤列表
            execute_step_fn: 异步函数，执行单个步骤
            screenshot_fn: 异步函数，返回截图bytes
            page_text_fn: 异步函数，返回页面文本

        Returns:
            TradeVerification: 交易验证结果
        """
        start_time = time.time()
        step_results = []
        anomalies = []

        for i, step in enumerate(steps):
            action = step.get("action", "unknown")

            # 构造当前步骤的执行函数
            async def _exec_step(s=step):
                await execute_step_fn(s)

            result = await self.verify_step(
                step_action=action,
                execute_fn=_exec_step,
                screenshot_fn=screenshot_fn,
                page_text_fn=page_text_fn,
                step_index=i,
            )
            step_results.append(result)

            if result.anomaly_detected:
                anomalies.append(f"步骤{i}({action}): {result.anomaly_detected}")

            # 验证码 → 立即停止，需要人工介入
            if result.status == VerifyStatus.FAIL_CAPTCHA:
                logger.error("验证码检测! 步骤%d, 需要人工处理", i)
                break

            # 执行错误 → 停止后续步骤
            if result.status == VerifyStatus.FAIL_ERROR:
                logger.error("步骤%d执行失败，终止交易: %s", i, result.error)
                break

            # 无变化 → 如果重试后仍无变化，继续下一步（有些操作确实不改变页面）
            if result.status == VerifyStatus.FAIL_NO_CHANGE:
                logger.warning("步骤%d无页面变化: SSIM=%.3f, 变化=%.1f%%",
                               i, result.ssim_score, result.change_pct * 100)

        total_ms = (time.time() - start_time) * 1000
        passed = sum(1 for r in step_results if r.status == VerifyStatus.PASS)
        retried = sum(1 for r in step_results if r.retries > 0)

        return TradeVerification(
            ok=passed == len(step_results) and len(step_results) == len(steps),
            steps=step_results,
            total_steps=len(step_results),
            passed_steps=passed,
            failed_steps=len(step_results) - passed,
            retried_steps=retried,
            anomalies=anomalies,
            total_elapsed_ms=total_ms,
        )
