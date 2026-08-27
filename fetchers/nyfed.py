"""NY Fed markets API。无需token。

规格书§4.6：回购操作结果取最近10次，识别SRF用量；另取SOFR做交叉源（验收12）。
FIMA 使用量不在此API，走手动。
"""
from __future__ import annotations

from .base import DataPoint, check_freshness, http_get, now_iso

BASE = "https://markets.newyorkfed.org/api"


def fetch_repo_ops(max_staleness_days: int = 5) -> DataPoint:
    dp = DataPoint(key="repo_ops", value=None, as_of=None,
                   source="NYFed:rp_results", tier=1, fetched_at=now_iso(), unit="bn")
    try:
        js = http_get(BASE + "/rp/all/all/results/last/10.json")
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp
    ops = js.get("repo", {}).get("operations", [])
    if ops:
        # 仅取 repo 方向（SRF），忽略 reverse repo
        srf = [o for o in ops if (o.get("operationType") or "").lower().startswith("repo")]
        pool = srf or ops
        latest = pool[0]
        total_accept = sum(float(d.get("totalAmtAccepted") or 0) for d in [latest])
        dp.value = round(total_accept / 1e9, 3)
        dp.as_of = (latest.get("operationDate") or "")[:10]
        dp.extra["ops"] = [{
            "date": (o.get("operationDate") or "")[:10],
            "type": o.get("operationType"),
            "accepted_bn": round(float(o.get("totalAmtAccepted") or 0) / 1e9, 3),
        } for o in pool[:10]]
        dp.extra["note"] = "SRF常备回购用量；>0 即为流动性压力信号"
    return check_freshness(dp, max_staleness_days)


def fetch_sofr(max_staleness_days: int = 5) -> DataPoint:
    """SOFR 官方一手（与 FRED:SOFR 做交叉源校验，验收12）。"""
    dp = DataPoint(key="sofr_nyfed", value=None, as_of=None,
                   source="NYFed:sofr", tier=1, fetched_at=now_iso(), unit="%")
    try:
        js = http_get(BASE + "/rates/secured/sofr/last/5.json")
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp
    rates = js.get("refRates", [])
    if rates:
        latest = rates[0]
        dp.value = float(latest.get("percentRate"))
        dp.as_of = (latest.get("effectiveDate") or "")[:10]
    return check_freshness(dp, max_staleness_days)
