"""「要崩没崩」相似日：每天自动查今天是不是又碰上了（2026-09-29 建）。

她 09-29 问：为什么 30 年利率冲新高、股票黄金一起跌、美元涨，却没有接着崩？能不能下次自动查？
条件和回测线脚本 `第三次回测研究9.2_数据/脚本/macro_0929/analog_0929.py` 完全一致（事先定，不按结果调）：
  30 年利率（^TYX）收盘 ≥ 过去 250 个交易日最高，且当天 +4 个基点以上；
  同一天 标普（^GSPC）跌、黄金（GC=F）跌、美元指数（DX-Y.NYB）涨。
这里只看"今天中没中、差哪条"，历史段落和每段用了什么办法写在 knowledge/analog_rates.yaml（有出处）。
这是消息层，不是信号层：中了只在网站上亮，不推送（推送要她批）。
"""
from __future__ import annotations

import datetime as dt

TICK = {"spx": "^GSPC", "y30": "^TYX", "gold": "GC=F", "usd": "DX-Y.NYB"}


def check() -> dict | None:
    try:
        import warnings
        warnings.filterwarnings("ignore")
        import pandas as pd
        import yfinance as yf
        D = pd.DataFrame({k: yf.Ticker(t).history(period="2y", interval="1d")["Close"] for k, t in TICK.items()})
        D.index = D.index.tz_localize(None).normalize()
        D = D.groupby(level=0).last().dropna()
        if len(D) < 260:
            return None
        r = D.pct_change()
        dy = D.y30.diff()
        hi250 = D.y30.rolling(250, min_periods=200).max().shift(1)
        base = (r.spx < 0) & (r.gold < 0) & (r.usd > 0) & (dy >= 0.04)
        cond = base & (D.y30 >= hi250)
        i = -1
        # 今天的日线要到收盘才算完整：美东 16:15 前用上一个交易日
        now_et = dt.datetime.now(dt.timezone(dt.timedelta(hours=-4)))
        if D.index[-1].date() == now_et.date() and now_et.hour * 60 + now_et.minute < 16 * 60 + 15:
            i = -2
        day = D.index[i].date().isoformat()
        hits = [d.date().isoformat() for d in D.index[cond]][-12:]
        return {
            "asof": day,
            "met": bool(cond.iloc[i]),
            "parts": {
                "y30_new_high": bool(D.y30.iloc[i] >= hi250.iloc[i]),
                "y30_up_4bp": bool(dy.iloc[i] >= 0.04),
                "spx_down": bool(r.spx.iloc[i] < 0),
                "gold_down": bool(r.gold.iloc[i] < 0),
                "usd_up": bool(r.usd.iloc[i] > 0),
            },
            "y30": round(float(D.y30.iloc[i]), 3),
            "y30_chg_bp": round(float(dy.iloc[i]) * 100, 1),
            "y30_hi250": round(float(hi250.iloc[i]), 3),
            "spx_pct": round(float(r.spx.iloc[i]) * 100, 2),
            "gold_pct": round(float(r.gold.iloc[i]) * 100, 2),
            "usd_pct": round(float(r.usd.iloc[i]) * 100, 2),
            "recent_hits": hits,
            "source": "yfinance ^TYX/^GSPC/GC=F/DX-Y.NYB，口径同 analog_0929.py",
        }
    except Exception:
        return None


if __name__ == "__main__":
    import json, sys
    sys.stdout.reconfigure(encoding="utf-8")
    print(json.dumps(check(), ensure_ascii=False, indent=1))
