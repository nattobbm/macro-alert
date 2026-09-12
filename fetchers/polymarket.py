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
        import json as _json
        # 2026-09-12：把五档全存下来（降50+/降25/不动/加25/加50+），三方对照页要显示
        # "维持"那一档，不能只有加息一个数。
        dist, vol = {}, {}
        for m in ev.get("markets", []):
            q = (m.get("question") or "").lower()
            prices = m.get("outcomePrices")
            if isinstance(prices, str):
                prices = _json.loads(prices)
            try:
                p = round(float(prices[0]), 3)   # YES价=概率
            except (TypeError, ValueError, IndexError):
                continue
            if "no change" in q:
                leg = "hold"
            elif "increase" in q:
                leg = "hike50p" if "50" in q else ("hike25" if "25 bps" in q else None)
            elif "decrease" in q:
                leg = "cut50p" if "50" in q else ("cut25" if "25 bps" in q else None)
            else:
                leg = None
            if not leg:
                continue
            dist[leg] = p
            vol[leg] = round(float(m.get("volume", 0) or 0) / 1e6, 1)
        if "hike25" in dist:
            dp.value = dist["hike25"]
            dp.as_of = dt.date.today().isoformat()
            dp.extra = {"dist": dist, "volume_mn": vol,
                        "note": "预测市场口径，与ZQ期货/CME不等同，仅并列参照"}
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp
    if dp.value is None:
        dp.stale = True
        dp.stale_reason = "market_not_found"
        return dp
    return check_freshness(dp, max_staleness_days)
