"""CFTC COT（Legacy Futures-only, Socrata API）。无需key。

规格书§4.5：数值以字符串返回需转型；每周五发布、数据截至当周周二。
输出：non-commercial 净多头 + 周变化 + 52周分位。
"""
from __future__ import annotations

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://publicreporting.cftc.gov/resource/6dca-aqww.json"


def _f(v):
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def fetch_code(key: str, code: str, max_staleness_days: int = 10) -> DataPoint:
    dp = DataPoint(key=key, value=None, as_of=None,
                   source=f"CFTC:legacy_fo:{code}", tier=1,
                   fetched_at=now_iso(), unit="contracts")
    try:
        rows = http_get(URL, {
            "cftc_contract_market_code": code,
            "$order": "report_date_as_yyyy_mm_dd DESC",
            "$limit": "52",
        })
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp

    nets = []
    for r in rows:
        lng = _f(r.get("noncomm_positions_long_all"))
        sht = _f(r.get("noncomm_positions_short_all"))
        if lng is None or sht is None:
            continue
        nets.append((r["report_date_as_yyyy_mm_dd"][:10], lng - sht))
    if nets:
        latest_date, latest_net = nets[0]
        dp.value = latest_net
        dp.as_of = latest_date
        if len(nets) > 1:
            dp.extra["chg_1w"] = latest_net - nets[1][1]
        vals = sorted(n for _, n in nets)
        rank = sum(1 for v in vals if v <= latest_net)
        dp.extra["pctile_52w"] = round(rank / len(vals) * 100, 1)
        dp.extra["n_weeks"] = len(nets)
        dp.extra["series"] = [[d, n] for d, n in reversed(nets)]
        dp.extra["market_name"] = rows[0].get("market_and_exchange_names", "")
    return check_freshness(dp, max_staleness_days)


def fetch_all(sources: dict) -> list[DataPoint]:
    out = []
    for key, cfg in sources.items():
        if cfg.get("provider") != "cftc":
            continue
        out.append(fetch_code(key, cfg["code"], cfg.get("max_staleness_days", 10)))
    return out
