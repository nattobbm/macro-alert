"""经济日历数据层：ForexFactory 周历 JSON（免费机读源）。

用途：①latest.json 供推理页/快报"未来几天有没有雷"；②每周存档 data/econ_cal/
积累历史 → 喂周期回测 M5 宏观日历（口径：发布时刻精确到分钟）。
展示层是 TradingView widget（site/CalendarPage），与本数据层独立。
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
KEEP_COUNTRIES = {"USD", "CNY", "JPY", "EUR", "GBP"}
KEEP_IMPACT = {"High", "Medium"}


def fetch(archive_dir: str | Path, max_staleness_days: int = 8) -> DataPoint:
    dp = DataPoint(key="econ_calendar", value=None, as_of=None,
                   source="ForexFactory:ff_calendar_thisweek", tier=2,
                   fetched_at=now_iso(), unit="events")
    try:
        rows = http_get(URL, timeout=30)
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp

    events = []
    for r in rows:
        if r.get("country") not in KEEP_COUNTRIES or r.get("impact") not in KEEP_IMPACT:
            continue
        events.append({
            "title": r.get("title"), "country": r.get("country"),
            "datetime": r.get("date"),                     # 含时区ISO
            "date": (r.get("date") or "")[:10],
            "impact": r.get("impact"),
            "forecast": r.get("forecast") or None,
            "previous": r.get("previous") or None,
        })
    events.sort(key=lambda e: e["datetime"] or "")
    dp.value = float(len(events))
    dp.as_of = dt.date.today().isoformat()
    dp.extra["events"] = events

    # 周存档（按ISO周），供M5宏观日历积累
    arch = Path(archive_dir)
    arch.mkdir(parents=True, exist_ok=True)
    y, w, _ = dt.date.today().isocalendar()
    (arch / f"{y}-W{w:02d}.json").write_text(
        json.dumps(events, ensure_ascii=False), encoding="utf-8")
    return check_freshness(dp, max_staleness_days)
