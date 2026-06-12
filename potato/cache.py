"""Decision cache — skip LLM when identical market signals repeat.

When the same market context (news + portfolio + prefs) produces a hash match,
return the cached decision instead of calling the LLM again.

All cache entries have TTL — stale decisions are never reused.
Cache hit/miss stats are tracked for monitoring.
"""
from __future__ import annotations

import hashlib
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger("potato.cache")


@dataclass
class CacheEntry:
    """缓存条目"""
    key: str
    decision: dict[str, Any]
    created_at: float
    ttl_seconds: float
    hit_count: int = 0

    @property
    def is_expired(self) -> bool:
        return time.time() - self.created_at > self.ttl_seconds


@dataclass
class CacheStats:
    """缓存统计"""
    hits: int = 0
    misses: int = 0
    evictions: int = 0
    size: int = 0

    @property
    def hit_rate(self) -> float:
        total = self.hits + self.misses
        return self.hits / total if total > 0 else 0.0

    def summary(self) -> str:
        return (
            f"决策缓存: {self.hits}命中/{self.misses}未命中 "
            f"(命中率{self.hit_rate:.1%}, 当前{self.size}条)"
        )


class DecisionCache:
    """市场决策缓存 — 真实hash匹配，TTL过期，线程安全

    接入点: potato/browser_cycle.py 的 Step 6 分析阶段
    """

    def __init__(self, ttl_seconds: float = 300.0, max_size: int = 100):
        self._store: dict[str, CacheEntry] = {}
        self._lock = threading.Lock()
        self._ttl = ttl_seconds
        self._max_size = max_size
        self._stats = CacheStats()

    @staticmethod
    def _make_key(
        news: list[dict[str, str]],
        portfolio_text: str,
        user_prefs: dict[str, Any],
        platform_names: str,
    ) -> str:
        """生成缓存key — 基于市场信号的真实hash"""
        payload = json.dumps({
            "news": [n.get("title", "") for n in news[:10]],  # 只取标题，避免内容波动
            "portfolio": portfolio_text[:500],  # 截断避免微小差异导致cache miss
            "prefs_keys": sorted(user_prefs.keys()),  # 只看配置项，不看值
            "platforms": platform_names,
        }, sort_keys=True, ensure_ascii=False)
        return hashlib.sha256(payload.encode()).hexdigest()[:16]

    def get(
        self,
        news: list[dict[str, str]],
        portfolio_text: str,
        user_prefs: dict[str, Any],
        platform_names: str,
    ) -> dict[str, Any] | None:
        """查询缓存 — 命中返回决策dict，未命中返回None"""
        key = self._make_key(news, portfolio_text, user_prefs, platform_names)

        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._stats.misses += 1
                self._stats.size = len(self._store)
                return None

            if entry.is_expired:
                del self._store[key]
                self._stats.evictions += 1
                self._stats.misses += 1
                self._stats.size = len(self._store)
                logger.debug("缓存过期: key=%s, age=%.0fs", key, time.time() - entry.created_at)
                return None

            entry.hit_count += 1
            self._stats.hits += 1
            age = time.time() - entry.created_at
            logger.info("缓存命中: key=%s, 第%d次命中, 缓存年龄%.0fs", key, entry.hit_count, age)
            return entry.decision

    def put(
        self,
        news: list[dict[str, str]],
        portfolio_text: str,
        user_prefs: dict[str, Any],
        platform_names: str,
        decision: dict[str, Any],
    ) -> str:
        """存入缓存 — 返回cache key"""
        key = self._make_key(news, portfolio_text, user_prefs, platform_names)

        with self._lock:
            # 容量检查 — 淘汰最老的
            if len(self._store) >= self._max_size:
                oldest_key = min(self._store, key=lambda k: self._store[k].created_at)
                del self._store[oldest_key]
                self._stats.evictions += 1

            self._store[key] = CacheEntry(
                key=key,
                decision=decision,
                created_at=time.time(),
                ttl_seconds=self._ttl,
            )
            self._stats.size = len(self._store)

        logger.info("缓存写入: key=%s, TTL=%.0fs", key, self._ttl)
        return key

    def clear(self) -> int:
        """清空缓存 — 返回清除的条目数"""
        with self._lock:
            count = len(self._store)
            self._store.clear()
            self._stats.size = 0
        return count

    def stats(self) -> CacheStats:
        """获取缓存统计"""
        return self._stats

    def cleanup_expired(self) -> int:
        """清理过期条目 — 返回清理数量"""
        with self._lock:
            expired_keys = [k for k, v in self._store.items() if v.is_expired]
            for k in expired_keys:
                del self._store[k]
            self._stats.evictions += len(expired_keys)
            self._stats.size = len(self._store)
        return len(expired_keys)


# 全局单例
_cache: DecisionCache | None = None


def get_decision_cache() -> DecisionCache:
    """获取全局决策缓存实例"""
    global _cache
    if _cache is None:
        _cache = DecisionCache()
    return _cache
