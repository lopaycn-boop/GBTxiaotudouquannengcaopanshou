"""Infoway A-share realtime market data provider."""

from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("potato.infoway")

INFOWAY_DOC_URL = "https://docs.infoway.io/readme/china-a-shares-realtime-market-data-api"
INFOWAY_DAILY_KLINE_API = "https://data.infoway.io/stock/v2/batch_kline"
INFOWAY_TRADE_API = "https://data.infoway.io/stock/batch_trade/{codes}"

_TIMEOUT = httpx.Timeout(connect=5.0, read=8.0, write=5.0, pool=15.0)


def _fetched_at() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_err(exc: Exception) -> str:
    msg = str(exc)
    return msg[:160] if len(msg) > 160 else msg


def _api_key() -> str:
    key = os.getenv("INFOWAY_API_KEY", "").strip()
    if key:
        return key
    try:
        from potato.vault import Vault

        return (Vault().get("INFOWAY_API_KEY") or "").strip()
    except Exception as exc:
        logger.debug("Infoway vault key lookup failed: %s", _safe_err(exc))
        return ""


def _headers(api_key: str) -> dict[str, str]:
    return {
        "apiKey": api_key,
        "Accept": "application/json",
        "User-Agent": "Mozilla/5.0",
    }


def normalize_a_share_symbol(stock_code: str) -> str:
    code = (stock_code or "").strip().upper()
    if not code:
        return ""
    if "." in code:
        symbol, market = code.split(".", 1)
        if symbol.isdigit() and market in {"SH", "SZ", "BJ"}:
            return f"{symbol}.{market}"
        return code
    digits = "".join(ch for ch in code if ch.isdigit())
    if len(digits) != 6:
        return ""
    if digits.startswith(("6", "9")):
        return f"{digits}.SH"
    if digits.startswith(("0", "2", "3")):
        return f"{digits}.SZ"
    if digits.startswith(("4", "8")):
        return f"{digits}.BJ"
    return ""


def _plain_code(symbol: str) -> str:
    return symbol.split(".", 1)[0] if "." in symbol else symbol


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None or value == "":
            return default
        return float(str(value).replace("%", ""))
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        if value is None or value == "":
            return default
        return int(float(str(value)))
    except (TypeError, ValueError):
        return default


def _success_data(data: dict[str, Any]) -> list[dict[str, Any]]:
    if data.get("ret") != 200:
        return []
    rows = data.get("data")
    return rows if isinstance(rows, list) else []


def _quote_from_daily_kline(stock_code: str, api_key: str) -> dict[str, Any]:
    symbol = normalize_a_share_symbol(stock_code)
    if not symbol:
        return {}
    fetched_at = _fetched_at()
    payload = {"klineType": 8, "klineNum": 1, "codes": symbol}
    try:
        with httpx.Client(timeout=_TIMEOUT, headers=_headers(api_key)) as client:
            resp = client.post(INFOWAY_DAILY_KLINE_API, json=payload)
            resp.raise_for_status()
            rows = _success_data(resp.json())
    except Exception as exc:
        logger.debug("Infoway daily kline error for %s: %s", stock_code, _safe_err(exc))
        return {}

    if not rows:
        return {}
    kline_rows = rows[0].get("respList") if isinstance(rows[0], dict) else None
    if not kline_rows:
        return {}
    latest = kline_rows[0]
    price = _to_float(latest.get("c"))
    if price <= 0:
        return {}
    change_amount = _to_float(latest.get("pca"))
    prev_close = round(price - change_amount, 4) if change_amount else 0.0
    return {
        "code": _plain_code(symbol),
        "symbol": symbol,
        "name": "",
        "open": _to_float(latest.get("o")),
        "prev_close": prev_close,
        "price": price,
        "high": _to_float(latest.get("h")),
        "low": _to_float(latest.get("l")),
        "volume": _to_int(latest.get("v")),
        "amount": _to_float(latest.get("vw")),
        "change_pct": _to_float(latest.get("pc")),
        "change_amount": change_amount,
        "market_timestamp": latest.get("t"),
        "source": "infoway_daily_kline",
        "source_name": "Infoway A股实时行情（日K）",
        "source_url": INFOWAY_DOC_URL,
        "fetched_at": fetched_at,
    }


def _quote_from_trade(stock_code: str, api_key: str) -> dict[str, Any]:
    symbol = normalize_a_share_symbol(stock_code)
    if not symbol:
        return {}
    fetched_at = _fetched_at()
    try:
        with httpx.Client(timeout=_TIMEOUT, headers=_headers(api_key)) as client:
            resp = client.get(INFOWAY_TRADE_API.format(codes=symbol))
            resp.raise_for_status()
            rows = _success_data(resp.json())
    except Exception as exc:
        logger.debug("Infoway trade error for %s: %s", stock_code, _safe_err(exc))
        return {}

    if not rows:
        return {}
    latest = rows[0]
    price = _to_float(latest.get("p"))
    if price <= 0:
        return {}
    return {
        "code": _plain_code(symbol),
        "symbol": symbol,
        "name": "",
        "price": price,
        "volume": _to_int(latest.get("v")),
        "amount": _to_float(latest.get("vw")),
        "market_timestamp": latest.get("t"),
        "trade_direction": latest.get("td"),
        "source": "infoway_trade",
        "source_name": "Infoway A股实时成交",
        "source_url": INFOWAY_DOC_URL,
        "fetched_at": fetched_at,
    }


def get_realtime_quote(stock_code: str) -> dict[str, Any]:
    """Return a verified A-share quote from Infoway if an API key is configured."""
    api_key = _api_key()
    if not api_key:
        return {}
    quote = _quote_from_daily_kline(stock_code, api_key)
    if quote:
        return quote
    return _quote_from_trade(stock_code, api_key)
