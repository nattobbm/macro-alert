"""事件流：官方RSS + 关键词打标签（零成本，无LLM）。

源均为一手官方发布，不含二手聚合站。标签词表从26条规则反推，
只做分拣不做解读——设计边界：推演由人签发。
"""
from __future__ import annotations

import datetime as dt
import email.utils
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

FEEDS = [
    ("Fed", "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("Fed讲话", "https://www.federalreserve.gov/feeds/speeches.xml"),
    ("EIA", "https://www.eia.gov/rss/todayinenergy.xml"),
    ("BEA", "https://apps.bea.gov/rss/rss.xml"),
    # 已测不可用（2026-08-27）：Treasury/BLS/NYFed 的RSS均403/404，GDELT超时。
    # 词表打标不解读；数字仍只认官方API源。
]

# 链条标签词表（六链 + 数据发布）。命中即打标，可多标。
TAGS = {
    "债务链": r"treasury|auction|refunding|buyback|debt|deficit|bond|yield|issuance|QRA",
    "货币链": r"\bfed\b|fomc|rate|federal funds|reserve|repo|QT|balance sheet|SOFR|IORB|liquidity|discount",
    "日本链": r"japan|boj|yen|jgb",
    "地缘链": r"iran|hormuz|sanction|strike|missile|opec|\boil\b|crude|israel|tanker",
    "AI链": r"nvidia|\bai\b|artificial intelligence|datacenter|data center|oracle|hyperscaler|chip",
    "黄金链": r"gold|bullion|comex|precious",
    "数据": r"\bcpi\b|\bppi\b|\bpce\b|payroll|employment|unemployment|gdp|retail sales|inflation",
}


def _parse_time(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(
            dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def _tag(title: str) -> list[str]:
    t = title.lower()
    return [name for name, pat in TAGS.items() if re.search(pat, t)] or ["其他"]


def _fetch_feed(source: str, url: str, timeout: int = 20) -> list[dict]:
    try:
        r = requests.get(url, timeout=timeout, headers={
            "User-Agent": "Mozilla/5.0 macro-alert/2.0"})
        r.raise_for_status()
        root = ET.fromstring(r.content)
    except Exception:
        return []
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        items.append({
            "title": title,
            "link": (item.findtext("link") or "").strip(),
            "published": _parse_time(item.findtext("pubDate")),
            "source": source,
            "tags": _tag(title),
        })
    return items[:20]


def fetch_news(store_path: str | Path, keep: int = 60) -> list[dict]:
    """拉全部源，与历史合并去重（按link），按时间倒序保留 keep 条。"""
    store_path = Path(store_path)
    old = []
    if store_path.exists():
        try:
            old = json.loads(store_path.read_text(encoding="utf-8"))
        except Exception:
            old = []
    fresh = []
    for source, url in FEEDS:
        fresh += _fetch_feed(source, url)

    seen, merged = set(), []
    for it in fresh + old:
        k = it.get("link") or it.get("title")
        if k in seen:
            continue
        seen.add(k)
        merged.append(it)
    merged.sort(key=lambda x: x.get("published") or "", reverse=True)
    merged = merged[:keep]
    store_path.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
    return merged
