"""ZQ联邦基金期货自算9月加息概率（CME FedWatch方法论近似）。

方法（pyfedwatch/CME公开方法论）：
  会议月合约隐含月均利率 = 100 − 价格
  月均 = (会前天数×会前EFFR + 会后天数×会后利率) / 当月天数
  P(hike25) = (倒推会后利率 − 会前EFFR) / 0.25
口径标注：tier 2（方法论复现，非CME官方读数）；与手动读数差>5pp告警。
每日存档 data/fedwatch/ → 预测单结算自动化。
数据源差异登记：EFFR用FRED:EFFR最新值；9月会议2026-09-16/17，新利率生效9/18。
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from .base import DataPoint, check_freshness, now_iso

SEP_MEETING_EFFECTIVE = dt.date(2026, 9, 18)   # 决议9/17，新利率次日生效
SEP_CONTRACT = "ZQU26.CBT"


def fetch(archive_dir: str | Path, max_staleness_days: int = 4) -> DataPoint:
    dp = DataPoint(key="fedwatch_zq_sep", value=None, as_of=None,
                   source="ZQ_futures:FedWatch_methodology(approx)", tier=2,
                   fetched_at=now_iso(), unit="prob")
    try:
        import yfinance as yf
        import requests
        h = yf.Ticker(SEP_CONTRACT).history(period="5d")
        if h.empty:
            raise ValueError("no ZQU26 data")
        px = float(h["Close"].iloc[-1])
        as_of = h.index[-1].date()

        # EFFR 一手（FRED）
        r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                         params={"series_id": "EFFR",
                                 "api_key": os.environ["FRED_API_KEY"],
                                 "file_type": "json", "sort_order": "desc",
                                 "limit": "5"}, timeout=30).json()
        effr = next(float(o["value"]) for o in r["observations"] if o["value"] != ".")

        implied_avg = 100.0 - px
        days_in_month = 30
        d_before = SEP_MEETING_EFFECTIVE.day - 1          # 9/1-9/17 旧利率
        d_after = days_in_month - d_before
        r_after = (implied_avg * days_in_month - d_before * effr) / d_after
        p_hike = (r_after - effr) / 0.25
        dp.value = round(max(0.0, min(1.0, p_hike)), 3)
        dp.as_of = as_of.isoformat()
        dp.extra = {"zq_price": px, "implied_avg": round(implied_avg, 4),
                    "effr": effr, "r_after_implied": round(r_after, 4),
                    "note": "CME方法论近似；与官方FedWatch可差1-2pp"}

        arch = Path(archive_dir); arch.mkdir(parents=True, exist_ok=True)
        (arch / f"{as_of.isoformat()}.json").write_text(
            json.dumps({"date": dp.as_of, "p_hike_sep": dp.value, **dp.extra}),
            encoding="utf-8")
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp
    return check_freshness(dp, max_staleness_days)
