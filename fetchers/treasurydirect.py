"""TreasuryDirect 拍卖结果。无需key。

规格书§4.4：
- API 不含 tail 和 WI。tail 优先手动值（auction_tail_bp），缺失回落合成值
  tail_bp_synthetic = highYield − 前一交易日同期限FRED收盘收益率（WI代理，非真实打印价）
- 需常规 UA；被拒时回落 FiscalData 镜像
"""
from __future__ import annotations

import datetime as dt

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://www.treasurydirect.gov/TA_WS/securities/auctioned"

# 期限 -> FRED 系列（合成tail用）
TERM_TO_FRED = {"10-Year": "DGS10", "30-Year": "DGS30", "20-Year": "DGS20",
                "2-Year": "DGS2", "3-Year": "DGS3", "5-Year": "DGS5", "7-Year": "DGS7"}


def _f(v):
    try:
        return float(v) if v not in (None, "") else None
    except (ValueError, TypeError):
        return None


def _pct(part, total):
    return round(part / total * 100, 2) if part is not None and total else None


def fetch_auctions(n_recent: int = 8) -> list[dict]:
    """最近 n 场 Note/Bond 拍卖，按日期倒序。"""
    rows = []
    for sec_type in ("Note", "Bond"):
        rows += http_get(URL, {"format": "json", "type": sec_type, "days": 60})
    out = []
    for s in rows:
        total = _f(s.get("totalAccepted"))
        btc = _f(s.get("bidToCoverRatio"))
        if not total or not btc:
            continue  # 未开标
        out.append({
            "cusip": s.get("cusip"),
            "term": s.get("securityTerm"),
            "type": s.get("type"),
            "auction_date": (s.get("auctionDate") or "")[:10],
            "high_yield": _f(s.get("highYield")),
            "bid_to_cover": round(btc, 3),
            "offering_bn": round(total / 1e9, 1),
            "indirect_pct": _pct(_f(s.get("indirectBidderAccepted")), total),
            "direct_pct": _pct(_f(s.get("directBidderAccepted")), total),
            "dealer_pct": _pct(_f(s.get("primaryDealerAccepted")), total),
            "soma_bn": round((_f(s.get("somaAccepted")) or 0) / 1e9, 2),
            "tail_bp": None,               # 手动录入覆盖
            "tail_bp_synthetic": None,     # monitor 里用FRED前收合成
        })
    out.sort(key=lambda a: a["auction_date"], reverse=True)
    return out[:n_recent]


def synthesize_tails(auctions: list[dict], fred_series: dict[str, list]) -> None:
    """tail_bp_synthetic = highYield − 拍卖日前最后一个FRED收盘。
    fred_series: {'DGS10': [[date,val],...], ...}（升序）。原地修改。
    看板必须标注：WI代理值，非真实打印价。
    """
    for a in auctions:
        series_key = None
        for term, sk in TERM_TO_FRED.items():
            if a["term"] and a["term"].startswith(term.split("-")[0] + "-"):
                series_key = sk
                break
        if not series_key or a["high_yield"] is None:
            continue
        series = fred_series.get(series_key) or []
        prev = [v for d, v in series if d < a["auction_date"]]
        if prev:
            a["tail_bp_synthetic"] = round((a["high_yield"] - prev[-1]) * 100, 1)


def fetch(max_staleness_days: int = 30) -> DataPoint:
    """打包成一个 DataPoint：value=最新一场的 bid_to_cover，extra=近8场明细。"""
    dp = DataPoint(key="auctions", value=None, as_of=None,
                   source="TreasuryDirect:auctioned", tier=1, fetched_at=now_iso())
    try:
        auctions = fetch_auctions()
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp
    if auctions:
        latest = auctions[0]
        dp.value = latest["bid_to_cover"]
        dp.as_of = latest["auction_date"]
        dp.extra["auctions"] = auctions
    return check_freshness(dp, max_staleness_days)
