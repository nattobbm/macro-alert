"""FRED 抓取。key 从环境变量 FRED_API_KEY。

规格书§4.1：
- 缺失值返回 "." → to_numeric(errors="coerce") 后取最后一个非NaN
- as_of 取该非NaN观测的 date，不是今天
- 限流 120次/分，本项目约11请求，加 0.5s sleep 保险
"""
from __future__ import annotations

import os
import time
import datetime as dt

import pandas as pd

from .base import DataPoint, check_freshness, http_get, now_iso

API = "https://api.stlouisfed.org/fred/series/observations"


def fetch_series(key: str, series: str, unit: str, max_staleness_days: int,
                 lookback_days: int = 400) -> DataPoint:
    """拉单条序列，返回最新非NaN值；历史序列放 extra['series']（看板用）。"""
    api_key = os.environ["FRED_API_KEY"]
    start = (dt.date.today() - dt.timedelta(days=lookback_days)).isoformat()
    js = http_get(API, {
        "series_id": series, "api_key": api_key, "file_type": "json",
        "observation_start": start, "sort_order": "asc",
    })
    obs = pd.DataFrame(js["observations"])
    dp = DataPoint(key=key, value=None, as_of=None, source=f"FRED:{series}",
                   tier=1, fetched_at=now_iso(), unit=unit)
    if not obs.empty:
        obs["value"] = pd.to_numeric(obs["value"], errors="coerce")
        obs = obs.dropna(subset=["value"])
        # 裁掉未来观测（GDPPOT等含CBO预测），"最新值"必须是已发生的
        obs = obs[obs["date"].astype(str).str[:10] <= dt.date.today().isoformat()]
        if not obs.empty:
            last = obs.iloc[-1]
            dp.value = float(last["value"])
            dp.as_of = str(last["date"])[:10]
            # 近250观测的 [date, value] 序列，供看板画图
            tail = obs.tail(250)
            dp.extra["series"] = [[str(d)[:10], float(v)]
                                  for d, v in zip(tail["date"], tail["value"])]
            if len(obs) >= 2:
                dp.extra["chg_1d"] = round(dp.value - float(obs.iloc[-2]["value"]), 4)
            if len(obs) >= 21:
                dp.extra["chg_20d"] = round(dp.value - float(obs.iloc[-21]["value"]), 4)
    time.sleep(0.5)
    return check_freshness(dp, max_staleness_days)


def fetch_all(sources: dict) -> list[DataPoint]:
    """sources: {key: cfg} 只取 provider==fred 的项。"""
    out = []
    for key, cfg in sources.items():
        if cfg.get("provider") != "fred":
            continue
        try:
            out.append(fetch_series(key, cfg["series"], cfg.get("unit", ""),
                                    cfg["max_staleness_days"],
                                    lookback_days=cfg.get("lookback_days", 400)))
        except Exception as e:
            out.append(DataPoint(key=key, value=None, as_of=None,
                                 source=f"FRED:{cfg.get('series','?')}", tier=1,
                                 fetched_at=now_iso(), stale=True,
                                 stale_reason=f"fetch_error:{type(e).__name__}:{e}"))
    return out
