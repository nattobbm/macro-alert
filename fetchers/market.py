"""行情（yfinance，tier 2 官方镜像）。"""
from __future__ import annotations

import datetime as dt

from .base import DataPoint, check_freshness, now_iso

TICKERS = {
    "spx": "^GSPC", "vix": "^VIX", "vix3m": "^VIX3M",
    "gold": "GC=F", "silver": "SI=F", "platinum": "PL=F",
    "dxy": "DX-Y.NYB", "usdjpy": "JPY=X",
    "brent": "BZ=F", "wti": "CL=F", "move": "^MOVE",
    # AI融资链的价格侧：英伟达是这条链的核心标的（5000亿融资平台、算力期货挂钩其GPU）
    "nvda": "NVDA", "sox": "^SOX",
}


def _bar_is_malformed(row) -> str | None:
    """OHLC自洽性检查。返回违例说明，正常返回None。

    2026-08-31 事故：周日夜盘刚开时 yfinance 的 BZ=F 日线给出
    开89.31/高89.09/低86.90/收88.47——最高价低于开盘价，物理上不可能。
    该坏数据让 Brent 显示 −0.83%，而真实是 +2.93%（霍尔木兹冲突推高油价），
    导致 G1「油价出上界」漏报了一次真实突破。
    未成形的当日K线对所有标的都可能这样，故做通用校验。
    """
    try:
        o, h, l, c = (float(row["Open"]), float(row["High"]),
                      float(row["Low"]), float(row["Close"]))
    except Exception:
        return None
    if not all(x > 0 for x in (o, h, l, c)):
        return "non_positive_price"
    if h < max(o, c) - 1e-9:
        return f"high({h:g})<max(open,close)({max(o, c):g})"
    if l > min(o, c) + 1e-9:
        return f"low({l:g})>min(open,close)({min(o, c):g})"
    if h < l:
        return f"high({h:g})<low({l:g})"
    return None


def fetch_all(max_staleness_days: int = 4, tickers: dict | None = None) -> list[DataPoint]:
    import yfinance as yf
    tickers = tickers or TICKERS
    out = []
    fetched = now_iso()
    for key, sym in tickers.items():
        dp = DataPoint(key=key, value=None, as_of=None, source=f"yfinance:{sym}",
                       tier=2, fetched_at=fetched)
        try:
            # SPX 抓2年（K线页可回滑），其余1年够用
            h = yf.Ticker(sym).history(period="2y" if key == "spx" else "1y",
                                       auto_adjust=False)
            if not h.empty:
                # 末根K线自洽性校验：坏了就退回上一根完整K线，并记原委。
                # 宁可用昨天的真数，也不用今天的坏数（坏数会让方向反向）。
                bad = _bar_is_malformed(h.iloc[-1]) if len(h) else None
                if bad and len(h) > 1:
                    dp.extra["dropped_bar"] = {
                        "date": h.index[-1].date().isoformat(), "reason": bad}
                    h = h.iloc[:-1]
                elif bad:
                    dp.stale = True
                    dp.stale_reason = f"malformed_bar:{bad}"
                    out.append(dp)
                    continue
                closes = h["Close"].dropna()
                dp.value = round(float(closes.iloc[-1]), 4)
                dp.as_of = closes.index[-1].date().isoformat()
                if len(closes) > 1:
                    prev = float(closes.iloc[-2])
                    dp.extra["chg_1d_pct"] = round((dp.value / prev - 1) * 100, 3) if prev else None
                tail = closes.tail(250)
                dp.extra["series"] = [[i.date().isoformat(), round(float(v), 4)]
                                      for i, v in tail.items()]
                if key == "spx":   # K线图用OHLC（近2年，可回滑）
                    ohlc = h[["Open", "High", "Low", "Close"]].dropna().tail(510)
                    dp.extra["ohlc"] = [
                        [i.date().isoformat()] + [round(float(x), 2) for x in row]
                        for i, row in ohlc.iterrows()]
        except Exception as e:
            dp.stale = True
            dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
            out.append(dp)
            continue
        out.append(check_freshness(dp, max_staleness_days))
    return out
