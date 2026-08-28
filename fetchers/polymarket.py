"""Polymarket 9月Fed决议市场（免费公开API，真金白银定价）。

口径：预测市场群体定价，与CME FedWatch(ZQ期货)不同口径——并列呈现不混用。
预测单登记的 settle_source_secondary。
"""
from __future__ import annotations

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://gamma-api.polymarket.com/events"
SLUG = "fed-decision-in-september-762"


def fetch(max_staleness_days: int = 3) -> DataPoint:
    import datetime as dt
    dp = DataPoint(key="polymarket_sep_hike", value=None, as_of=None,
                   source=f"Polymarket:{SLUG}", tier=2,
                   fetched_at=now_iso(), unit="prob")
    try:
        evs = http_get(URL, {"slug": SLUG})
        ev = evs[0] if isinstance(evs, list) else evs
        for m in ev.get("markets", []):
            q = (m.get("question") or "").lower()
            if "increase" in q and "25 bps" in q and "50" not in q:
                import json as _json
                prices = m.get("outcomePrices")
                if isinstance(prices, str):
                    prices = _json.loads(prices)
                dp.value = round(float(prices[0]), 3)   # YES价=概率
                dp.as_of = dt.date.today().isoformat()
                dp.extra = {"volume_mn": round(float(m.get("volume", 0) or 0) / 1e6, 1),
                            "note": "预测市场口径，与ZQ期货/CME不等同，仅并列参照"}
                break
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp
    if dp.value is None:
        dp.stale = True
        dp.stale_reason = "market_not_found"
        return dp
    return check_freshness(dp, max_staleness_days)
