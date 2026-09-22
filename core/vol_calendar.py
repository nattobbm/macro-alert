"""波动日历：什么日子、哪个标的、动几倍。

2026-09-21 建。Momo：「先做日历表拆解，做单一标的拆解」。
口径和 9-13《赚钱方案设计》§8.1 那张表一致，改成脚本每周自动重算：

  事件日当天 |变动| 的中位数 ÷ 平常日子 |变动| 的中位数 = 倍数

  · 标普 / 黄金 / 美元 / 日元：|收盘涨跌幅 %|
  · 30 年利率：|收益率变动| 换成 bp（^TYX 报的是百分数，×100）
  · 恐慌指数：|点数变动|
  · "平常日子" = 不落在任何一类事件日上的交易日（周度初请不算事件）

事件日来源：
  · 议息：federalreserve.gov 官方日程（决议日=会议第二天），2024-09 → 2026-12 写死在下面，
    2026-09-21 从 fomccalendars.htm 核过一遍
  · 非农 / CPI / PPI / 零售：data/econ_cal_history/fred_releases_*.parquet（FRED 官方发布日）

另给每个标的三个尺度：一天 / 一个月(21 个交易日) / 一年(252 个交易日) 的 |变动| 中位数——
单标的卡的骨架。

中位数不是平均：中间小、尾巴肥（议息日黄金最大动过 4.4%）。卡上要写明。
输出 data/vol_calendar.json；monitor 每次完整跑时若文件超过 7 天就重算。
"""
from __future__ import annotations

import datetime as dt
import glob
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = DATA / "vol_calendar.json"
WINDOW_START = "2024-08-01"

# (key, yahoo, 人话名, 英文名, 单位)  单位 % = 涨跌幅；bp = 收益率变动；pt = 点数
ASSETS = [
    ("spx",    "^GSPC",    "标普",     "S&P 500",   "%"),
    ("gold",   "GC=F",     "黄金",     "Gold",      "%"),
    ("dxy",    "DX-Y.NYB", "美元",     "Dollar",    "%"),
    ("us30y",  "^TYX",     "30年利率", "30Y yield", "bp"),
    ("usdjpy", "JPY=X",    "日元",     "Yen",       "%"),
    ("vix",    "^VIX",     "恐慌指数", "VIX",       "pt"),
]

# FOMC 决议日（会议第二天）。federalreserve.gov/monetarypolicy/fomccalendars.htm，2026-09-21 核实
FOMC_DECISION_DATES = [
    "2024-09-18", "2024-11-07", "2024-12-18",
    "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30",
    "2025-09-17", "2025-10-29", "2025-12-10",
    "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29",
    "2026-09-16", "2026-10-28", "2026-12-09",
]

# 事件类型 → (人话名, 英文, FRED release 名, 日历标题里的匹配词)
EVENTS = {
    "FOMC":   ("议息", "FOMC",        None,                                               ["FOMC", "议息", "利率决议"]),
    "NFP":    ("非农", "Payrolls",    "Employment Situation",                             ["非农"]),
    "CPI":    ("CPI",  "CPI",         "Consumer Price Index",                             ["消费者物价CPI", "核心CPI"]),
    "PPI":    ("PPI",  "PPI",         "Producer Price Index",                             ["生产者物价PPI", "核心PPI"]),
    "RETAIL": ("零售", "Retail sales","Advance Monthly Sales for Retail and Food Services",["零售销售"]),
}


def _event_dates() -> dict[str, list[str]]:
    out = {"FOMC": list(FOMC_DECISION_DATES)}
    files = sorted(glob.glob(str(DATA / "econ_cal_history" / "fred_releases_*.parquet")))
    if files:
        import pandas as pd
        df = pd.read_parquet(files[-1])
        for k, (_, _, rel, _) in EVENTS.items():
            if rel:
                out[k] = sorted({str(d)[:10] for d in df.loc[df.release_name == rel, "date"]})
    return out


def _median(xs):
    xs = sorted(x for x in xs if x == x)
    if not xs:
        return None
    m = len(xs) // 2
    return xs[m] if len(xs) % 2 else (xs[m - 1] + xs[m]) / 2


def compute(end: dt.date | None = None) -> dict:
    import warnings
    warnings.filterwarnings("ignore")
    import yfinance as yf

    end = end or dt.date.today()
    ev_dates = _event_dates()
    ev_set = {k: set(v) for k, v in ev_dates.items()}
    all_event_days = set().union(*ev_set.values())

    assets_out, ratios = {}, {k: {} for k in EVENTS}
    n_baseline = None
    for key, sym, zh, en, unit in ASSETS:
        h = yf.Ticker(sym).history(start=WINDOW_START, end=(end + dt.timedelta(days=1)).isoformat())
        c = h["Close"].dropna()
        if len(c) < 300:
            continue
        idx = [d.date().isoformat() for d in c.index]
        vals = [float(v) for v in c]

        def chg(n):
            out = {}
            for i in range(n, len(vals)):
                a, b = vals[i - n], vals[i]
                if unit == "%":
                    out[idx[i]] = abs(b / a - 1) * 100
                elif unit == "bp":
                    out[idx[i]] = abs(b - a) * 100
                else:
                    out[idx[i]] = abs(b - a)
            return out

        d1, d21, d252 = chg(1), chg(21), chg(252)
        base = [v for d, v in d1.items() if d not in all_event_days]
        base_med = _median(base)
        if n_baseline is None:
            n_baseline = len(base)
        assets_out[key] = {
            "label": zh, "label_en": en, "unit": unit, "symbol": sym,
            "d1": round(base_med, 2) if base_med is not None else None,
            "d21": round(_median(d21.values()), 1),
            "d252": round(_median(d252.values()), 1),
            "n_d1": len(d1), "n_d21": len(d21), "n_d252": len(d252),
            "max_event_day": {},
        }
        for ek in EVENTS:
            on = [d1[d] for d in ev_set.get(ek, ()) if d in d1]
            if len(on) >= 5 and base_med:
                ratios[ek][key] = round(_median(on) / base_med, 1)
                assets_out[key]["max_event_day"][ek] = round(max(on), 2)

    events_out = {}
    for ek, (zh, en, _, words) in EVENTS.items():
        n = len([d for d in ev_dates.get(ek, []) if WINDOW_START <= d <= end.isoformat()])
        events_out[ek] = {"label": zh, "label_en": en, "n": n, "ratio": ratios[ek], "match": words}

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "window": {"start": WINDOW_START, "end": end.isoformat()},
        "n_baseline_days": n_baseline,
        "method": "事件日当天|变动|中位数 ÷ 平常日子|变动|中位数；平常=不落在任何事件日的交易日",
        "assets": assets_out,
        "events": events_out,
        "event_dates": {k: [d for d in v if d <= (end + dt.timedelta(days=120)).isoformat()]
                        for k, v in ev_dates.items()},
    }


def load_or_refresh(max_age_days: int = 7) -> dict | None:
    """monitor 用：文件够新就读，不然重算。任何失败都不阻断主流程。"""
    try:
        if OUT.exists():
            j = json.loads(OUT.read_text(encoding="utf-8"))
            g = dt.datetime.fromisoformat(j["generated_at"].replace("Z", "+00:00"))
            if (dt.datetime.now(dt.timezone.utc) - g).days < max_age_days:
                return j
        j = compute()
        OUT.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
        return j
    except Exception as e:  # noqa: BLE001
        print(f"[warn] vol_calendar: {type(e).__name__}: {e}", file=sys.stderr)
        try:
            return json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else None
        except Exception:
            return None


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")
    j = compute()
    OUT.write_text(json.dumps(j, ensure_ascii=False, indent=1), encoding="utf-8")
    print("窗口", j["window"], "| 平常日子", j["n_baseline_days"], "天")
    keys = [a[0] for a in ASSETS]
    print("%-8s %-4s " % ("事件", "n") + " ".join("%7s" % k for k in keys))
    for ek, e in j["events"].items():
        print("%-8s %-4d " % (e["label"], e["n"]) + " ".join("%6s×" % e["ratio"].get(k, "—") for k in keys))
    print()
    for k, a in j["assets"].items():
        print("%-8s 一天 %s%s · 一月 %s · 一年 %s" % (a["label"], a["d1"], a["unit"], a["d21"], a["d252"]))
