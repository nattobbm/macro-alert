"""ZQ联邦基金期货自算「下一场会议」加息概率（CME FedWatch 方法论近似）。

2026-09-20 重写：原来这个文件把九月会议写死（SEP_CONTRACT = ZQU26）。
九月会议 9-16 开完之后这个槽位就废了——首页剧本卡第一条永远显示"暂无数据"，
而它问的是"市场认为9月加息的可能性"，一个已经发生过的事。Momo 指出来：
「现在加息了加的是哪一个，这个要改吗」。改成跟着会议日程自动滚。

**为什么不用会议当月的合约**
联邦基金期货结算的是「当月每日实际隔夜利率的算术平均」。会议在月中或月末时，
当月合约里只有一小段是会后利率，倒推要除以那一小段的天数，噪音被放大。
10-28 这场尤其极端：决议 10-28、新利率 10-29 生效，十月 31 天里只有 3 天是新利率，
除以 3/31 等于把误差放大十倍。

**用哪个合约**
取「整月都处在这场会议之后、且下一场会议还没生效」的第一个月。
这样隐含月均利率 = 会后利率本身，不用拆分，倒推只有一步：
    P(加息25bp) = (隐含月均 − 会前EFFR) / 0.25
2026-10-28 这场对应 11 月合约（ZQX26）：11 月无会议，整月都是会后利率。
下一场 12-8/9 对应 2027 年 1 月合约。

**FOMC 日程**（2026-09-20 从 federalreserve.gov/monetarypolicy/fomccalendars.htm 核实）
2026: 1/27-28, 3/17-18, 4/28-29, 6/16-17, 7/28-29, 9/15-16, 10/27-28, 12/8-9
新利率一律次日生效。

口径标注：tier 2（方法论复现，非 CME 官方读数），与官方 FedWatch 可差 1-2pp。
每日存档 data/fedwatch/ → 预测单结算自动化。EFFR 用 FRED:EFFR 最新值。
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from .base import DataPoint, check_freshness, now_iso

# (决议日, 新利率生效日)。生效日=决议次日。
FOMC_MEETINGS: list[tuple[dt.date, dt.date]] = [
    (dt.date(2026, 1, 28), dt.date(2026, 1, 29)),
    (dt.date(2026, 3, 18), dt.date(2026, 3, 19)),
    (dt.date(2026, 4, 29), dt.date(2026, 4, 30)),
    (dt.date(2026, 6, 17), dt.date(2026, 6, 18)),
    (dt.date(2026, 7, 29), dt.date(2026, 7, 30)),
    (dt.date(2026, 9, 16), dt.date(2026, 9, 17)),
    (dt.date(2026, 10, 28), dt.date(2026, 10, 29)),
    (dt.date(2026, 12, 9), dt.date(2026, 12, 10)),
]

# 期货月份代码（CME 标准）
_MONTH_CODE = {1: "F", 2: "G", 3: "H", 4: "J", 5: "K", 6: "M",
               7: "N", 8: "Q", 9: "U", 10: "V", 11: "X", 12: "Z"}


def next_meeting(today: dt.date) -> tuple[dt.date, dt.date] | None:
    """今天之后（含当天尚未开完的）第一场会议。决议当天算还没开完。"""
    for decide, eff in FOMC_MEETINGS:
        if decide >= today:
            return decide, eff
    return None


def _clean_contract_month(eff: dt.date, today: dt.date) -> tuple[int, int] | None:
    """找整月都在本场会议之后、下一场又还没生效的第一个月。返回 (年, 月)。"""
    y, m = (eff.year + 1, 1) if eff.month == 12 else (eff.year, eff.month + 1)
    for _ in range(4):
        first = dt.date(y, m, 1)
        last = (dt.date(y + 1, 1, 1) if m == 12 else dt.date(y, m + 1, 1)) - dt.timedelta(days=1)
        # 该月内不能有别的会议生效
        if not any(first <= e2 <= last for _d2, e2 in FOMC_MEETINGS if e2 > eff):
            return y, m
        y, m = (y + 1, 1) if m == 12 else (y, m + 1)
    return None


def _symbol(year: int, month: int) -> str:
    return f"ZQ{_MONTH_CODE[month]}{year % 100:02d}.CBT"


def fetch(archive_dir: str | Path, max_staleness_days: int = 4,
          today: dt.date | None = None) -> DataPoint:
    today = today or dt.date.today()
    dp = DataPoint(key="fedwatch_next_hike", value=None, as_of=None,
                   source="ZQ_futures:FedWatch_methodology(approx)", tier=2,
                   fetched_at=now_iso(), unit="prob")
    nm = next_meeting(today)
    if not nm:
        dp.stale = True
        dp.stale_reason = "no_scheduled_meeting_in_table"
        return dp
    decide, eff = nm
    cm = _clean_contract_month(eff, today)
    if not cm:
        dp.stale = True
        dp.stale_reason = "no_clean_contract_month"
        return dp
    sym = _symbol(*cm)
    try:
        import yfinance as yf
        import requests
        h = yf.Ticker(sym).history(period="5d")
        if h.empty:
            raise ValueError(f"no data for {sym}")
        px = float(h["Close"].iloc[-1])
        as_of = h.index[-1].date()

        r = requests.get("https://api.stlouisfed.org/fred/series/observations",
                         params={"series_id": "EFFR",
                                 "api_key": os.environ["FRED_API_KEY"],
                                 "file_type": "json", "sort_order": "desc",
                                 "limit": "5"}, timeout=30).json()
        effr = next(float(o["value"]) for o in r["observations"] if o["value"] != ".")

        implied_avg = 100.0 - px
        # 整月都是会后利率，所以隐含月均就是会后利率本身，不用按天拆
        p_hike = (implied_avg - effr) / 0.25
        dp.value = round(max(0.0, min(1.0, p_hike)), 3)
        dp.as_of = as_of.isoformat()
        dp.extra = {
            "meeting_date": decide.isoformat(),
            "effective_date": eff.isoformat(),
            "contract": sym,
            "contract_month": f"{cm[0]}-{cm[1]:02d}",
            "zq_price": px,
            "implied_avg": round(implied_avg, 4),
            "effr": effr,
            "raw_p_uncapped": round((implied_avg - effr) / 0.25, 3),
            "note": ("CME方法论近似；合约选的是整月都在会后、下一场又没生效的月份，"
                     "所以隐含月均=会后利率，不按天拆。与官方FedWatch可差1-2pp"),
        }
        arch = Path(archive_dir)
        arch.mkdir(parents=True, exist_ok=True)
        (arch / f"{as_of.isoformat()}.json").write_text(
            json.dumps({"date": dp.as_of, "p_hike_next": dp.value,
                        "meeting": decide.isoformat(), **dp.extra},
                       ensure_ascii=False),
            encoding="utf-8")
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp
    return check_freshness(dp, max_staleness_days)


if __name__ == "__main__":       # 手查用
    import tempfile
    d = fetch(tempfile.mkdtemp())
    print(d.key, d.value, d.as_of, d.stale, d.stale_reason)
    print(json.dumps(d.extra, ensure_ascii=False, indent=1))
