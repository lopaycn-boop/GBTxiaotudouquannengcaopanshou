"""A股专业知识+电脑操盘知识 永久记忆加载器

启动时自动检测记忆系统是否为空，如果为空则把专业知识灌入。
下载一次后永久保存在本地SQLite数据库中。
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

logger = logging.getLogger("potato.knowledge")

_KNOWLEDGE_DIR = Path(__file__).resolve().parent


def load_knowledge_to_memory(settings=None) -> dict:
    """加载A股专业知识和操盘知识到永久记忆系统。
    
    只在首次运行时加载（检查 knowledge_loaded 标记），
    之后知识永久保存在本地数据库，不再重复加载。
    
    Returns:
        {"facts_loaded": int, "episodes_loaded": int, "files": list}
    """
    from potato.memory import MemoryStore

    mem = MemoryStore(settings)
    
    # 检查是否已加载
    already_loaded = mem.get_fact("knowledge_loaded")
    if already_loaded:
        logger.info("专业知识已加载过(%s)，跳过", already_loaded)
        return {"status": "already_loaded", "loaded_at": already_loaded}
    
    total_facts = 0
    total_episodes = 0
    files_loaded = []
    
    for json_file in _KNOWLEDGE_DIR.glob("*.json"):
        try:
            data = json.loads(json_file.read_text(encoding="utf-8"))
        except Exception as e:
            logger.error("读取知识文件失败 %s: %s", json_file.name, e)
            continue
        
        # 加载 facts
        for fact in data.get("facts", []):
            try:
                mem.set_fact(
                    key=fact["key"],
                    value=fact["value"],
                    source=fact.get("source", "knowledge_base"),
                    confidence=fact.get("confidence", 1.0),
                )
                total_facts += 1
            except Exception as e:
                logger.warning("加载fact失败 %s: %s", fact.get("key", "?"), e)
        
        # 加载 episodes（永久记忆 ttl=36500天=100年）
        for ep in data.get("episodes", []):
            try:
                mem.store_episode(
                    content=ep["content"],
                    category=ep.get("category", "knowledge"),
                    importance=ep.get("importance", 8),
                    tags=ep.get("tags", []),
                    ttl_days=ep.get("ttl_days", 36500),
                )
                total_episodes += 1
            except Exception as e:
                logger.warning("加载episode失败: %s", e)
        
        files_loaded.append(json_file.name)
    
    # 标记已加载
    from datetime import datetime, timezone
    mem.set_fact("knowledge_loaded", datetime.now(timezone.utc).isoformat(), source="system")
    
    logger.info("专业知识加载完成: %d facts, %d episodes, 文件: %s", 
                total_facts, total_episodes, files_loaded)
    
    return {
        "status": "loaded",
        "facts_loaded": total_facts,
        "episodes_loaded": total_episodes,
        "files": files_loaded,
    }


def get_knowledge_summary(settings=None) -> dict:
    """获取已加载的知识摘要。"""
    from potato.memory import MemoryStore
    mem = MemoryStore(settings)
    
    loaded_at = mem.get_fact("knowledge_loaded")
    all_facts = mem.get_all_facts()
    
    # 按前缀分类统计
    categories = {}
    for key in all_facts:
        prefix = key.split("_")[0] if "_" in key else "other"
        categories[prefix] = categories.get(prefix, 0) + 1
    
    return {
        "loaded": bool(loaded_at),
        "loaded_at": loaded_at,
        "total_facts": len(all_facts),
        "categories": categories,
    }
