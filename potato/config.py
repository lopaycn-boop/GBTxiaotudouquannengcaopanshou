from __future__ import annotations

import os
from dataclasses import dataclass
from decimal import Decimal
from pathlib import Path

import yaml
from dotenv import load_dotenv

from potato.secret_store import load_db_secrets, resolve_secret

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    """本地APP配置 — 去掉Zeabur/CRDB云端依赖"""
    chain_id: int
    tag_id: int
    trading_mode: str
    github_token: str
    deepseek_api_key: str
    github_repo: str
    max_single_cny: Decimal
    max_daily_cny: Decimal
    min_volume_24h: Decimal
    min_price: Decimal
    max_price: Decimal
    take_profit_pct: Decimal
    stop_loss_pct: Decimal
    max_open_positions: int
    default_order_size_cny: Decimal
    max_consecutive_failures: int
    llm_model: str
    potato_api_key: str
    notify_enabled: bool
    notify_channels: tuple[str, ...]
    telegram_bot_token: str
    telegram_chat_id: str
    dingtalk_webhook_url: str
    dingtalk_secret: str
    feishu_webhook_url: str
    feishu_app_id: str
    feishu_app_secret: str
    feishu_receive_id: str
    feishu_api_base: str

    @property
    def dry_run(self) -> bool:
        return self.trading_mode.lower() != "live"

    # ── CRDB兼容属性 — 本地APP不用CRDB，返回空让db.py fallback到SQLite ──
    @property
    def crdb_url(self) -> str:
        return ""

    @property
    def crdb_ssl_root_cert(self) -> str:
        return ""

    @property
    def crdb_dsn(self) -> str:
        return ""

    # ── Zeabur兼容属性 — 本地APP不用Zeabur ──
    @property
    def zeabur_api_key(self) -> str:
        return ""

    @property
    def zeabur_project_id(self) -> str:
        return ""

    @property
    def zeabur_service_id(self) -> str:
        return ""

    @property
    def zeabur_environment_id(self) -> str:
        return ""


def _dec(name: str, default: str, secrets: dict[str, str] | None = None) -> Decimal:
    if secrets and name in secrets and secrets[name]:
        return Decimal(secrets[name])
    return Decimal(os.getenv(name, default))


def _load_db_secrets() -> dict[str, str]:
    return load_db_secrets()


def load_settings(*, use_db_secrets: bool = True) -> Settings:
    cfg_path = ROOT / "config" / "potato.yaml"
    cfg = {}
    if cfg_path.exists():
        with cfg_path.open(encoding="utf-8") as f:
            cfg = yaml.safe_load(f) or {}

    strat = cfg.get("strategy", {})
    risk = cfg.get("risk", {})
    oc = cfg.get("openclaw", {})

    secrets: dict[str, str] = _load_db_secrets() if use_db_secrets else {}

    def s(key: str, *env_names: str, default: str = "") -> str:
        return resolve_secret(key, secrets, *env_names, default=default)

    return Settings(
        chain_id=int(cfg.get("chain_id", 0)),
        tag_id=int(cfg.get("tag_id", 0)),
        trading_mode=s("POTATO_TRADING_MODE", "POTATO_TRADING_MODE", default="dry_run"),
        github_token=s("GITHUB_TOKEN", "GITHUB_TOKEN", "GITHUB_PAT", "GITHUB_PUSH_TOKEN"),
        deepseek_api_key=s("DEEPSEEK_API_KEY", "DEEPSEEK_API_KEY"),
        github_repo=s("GITHUB_REPO", "GITHUB_REPO", default="YOUR_GITHUB_USERNAME/a-stock-desktop-pet"),
        potato_api_key=s("POTATO_API_KEY", "POTATO_API_KEY"),
        max_single_cny=_dec("POTATO_MAX_SINGLE_CNY", str(risk.get("max_single_cny", 300)), secrets),
        max_daily_cny=_dec("POTATO_MAX_DAILY_CNY", str(risk.get("max_daily_cny", 1500)), secrets),
        min_volume_24h=_dec("POTATO_MIN_VOLUME_24H", str(strat.get("min_volume_24h", 50000)), secrets),
        min_price=_dec("POTATO_MIN_PRICE", str(strat.get("min_price", 5.0)), secrets),
        max_price=_dec("POTATO_MAX_PRICE", str(strat.get("max_price", 100.0)), secrets),
        take_profit_pct=_dec("POTATO_TAKE_PROFIT_PCT", str(strat.get("take_profit_pct", 0.10)), secrets),
        stop_loss_pct=_dec("POTATO_STOP_LOSS_PCT", str(strat.get("stop_loss_pct", 0.05)), secrets),
        max_open_positions=int(secrets.get("POTATO_MAX_OPEN_POSITIONS", "") or os.getenv("POTATO_MAX_OPEN_POSITIONS", str(risk.get("max_open_positions", 5)))),
        default_order_size_cny=_dec("POTATO_DEFAULT_ORDER_SIZE_CNY", str(strat.get("default_order_size_cny", 200)), secrets),
        max_consecutive_failures=int(risk.get("max_consecutive_failures", 3)),
        llm_model=s("POTATO_LLM_MODEL", "POTATO_LLM_MODEL", default=oc.get("model", "deepseek/deepseek-chat")),
        notify_enabled=s("POTATO_NOTIFY_ENABLED", "POTATO_NOTIFY_ENABLED", default="true").lower() in {"1", "true", "yes"},
        notify_channels=tuple(
            c.strip().lower()
            for c in s(
                "POTATO_NOTIFY_CHANNELS",
                "POTATO_NOTIFY_CHANNELS",
                default="telegram,dingtalk",
            ).split(",")
            if c.strip()
        ),
        telegram_bot_token=s("TELEGRAM_BOT_TOKEN", "TELEGRAM_BOT_TOKEN"),
        telegram_chat_id=s("TELEGRAM_CHAT_ID", "TELEGRAM_CHAT_ID"),
        dingtalk_webhook_url=s("DINGTALK_WEBHOOK_URL", "DINGTALK_WEBHOOK_URL"),
        dingtalk_secret=s("DINGTALK_SECRET", "DINGTALK_SECRET"),
        feishu_webhook_url=s("FEISHU_WEBHOOK_URL", "FEISHU_WEBHOOK_URL"),
        feishu_app_id=s("FEISHU_APP_ID", "FEISHU_APP_ID"),
        feishu_app_secret=s("FEISHU_APP_SECRET", "FEISHU_APP_SECRET"),
        feishu_receive_id=s("FEISHU_RECEIVE_ID", "FEISHU_RECEIVE_ID"),
        feishu_api_base=s(
            "FEISHU_API_BASE",
            "FEISHU_API_BASE",
            default="https://open.larksuite.com",
        ),
    )
