"""EIA API v2（勿用v1，2022-11停用）。key 从环境变量 EIA_API_KEY。"""
from __future__ import annotations

import os

from .base import DataPoint, check_freshness, http_get, now_iso

BASE = "https://api.eia.gov/v2/"


def fetch_crude_stocks(max_staleness_days: int = 10) -> DataPoint:
    dp = DataPoint(key="crude_stocks", value=None, as_of=None,
                   source="EIA:petroleum/stoc/wstk", tier=1,
                   fetched_at=now_iso(), unit="k_bbl")
    api_key = os.environ.get("EIA_API_KEY")
    if not api_key:
        dp.stale = True
        dp.stale_reason = "missing_EIA_API_KEY"
        return dp
    try:
        js = http_get(BASE + "petroleum/stoc/wstk/data/", {
            "api_key": api_key, "frequency": "weekly", "data[0]": "value",
            "facets[series][]": "WCESTUS1",   # 商业原油库存（不含SPR）
            "sort[0][column]": "period", "sort[0][direction]": "desc", "length": "10",
        })
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp
    rows = js.get("response", {}).get("data", [])
    if rows:
        dp.value = float(rows[0]["value"])
        dp.as_of = rows[0]["period"]
        dp.extra["series"] = [[r["period"], float(r["value"])] for r in reversed(rows)]
    return check_freshness(dp, max_staleness_days)
