"""行情（yfinance，tier 2 官方镜像）。"""
from __future__ import annotations

import datetime as dt

from .base import DataPoint, check_freshness, now_iso

TICKERS = {
    "spx": "^GSPC", "vix": "^VIX", "vix3m": "^VIX3M",
    "gold": "GC=F", "silver": "SI=F", "platinum": "PL=F",
    "dxy": "DX-Y.NYB", "usdjpy": "JPY=X",
    "brent": "BZ=F", "wti": "CL=F", "move": "^MOVE",
}


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
