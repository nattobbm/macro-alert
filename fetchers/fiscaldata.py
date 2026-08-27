"""Treasury Fiscal Data。无需key。

规格书§4.2：所有值以字符串返回（含null），必须转型；
取最新用 sort=-record_date&page[size]=1；as_of = record_date。
"""
from __future__ import annotations

from .base import DataPoint, check_freshness, http_get, now_iso

BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service/"


def _latest_row(endpoint: str, filters: str | None = None, fields: str | None = None) -> dict | None:
    params = {"sort": "-record_date", "page[size]": "1"}
    if filters:
        params["filter"] = filters
    if fields:
        params["fields"] = fields
    js = http_get(BASE + endpoint, params)
    data = js.get("data", [])
    return data[0] if data else None


def _to_float(v):
    if v in (None, "", "null"):
        return None
    try:
        return float(v)
    except ValueError:
        return None


def fetch_debt_total(max_staleness_days: int = 4) -> DataPoint:
    row = _latest_row("v2/accounting/od/debt_to_penny")
    dp = DataPoint(key="debt_total", value=None, as_of=None,
                   source="FiscalData:debt_to_penny", tier=1,
                   fetched_at=now_iso(), unit="usd")
    if row:
        dp.value = _to_float(row.get("tot_pub_debt_out_amt"))
        dp.as_of = row.get("record_date")
    return check_freshness(dp, max_staleness_days)


def fetch_tga_daily(max_staleness_days: int = 4) -> DataPoint:
    """DTS operating cash balance。v1端点，取 TGA closing balance。"""
    row = _latest_row("v1/accounting/dts/operating_cash_balance")
    dp = DataPoint(key="tga_daily", value=None, as_of=None,
                   source="FiscalData:dts_operating_cash_balance", tier=1,
                   fetched_at=now_iso(), unit="mn")
    if row:
        # 字段名历史上变过：open_today_bal / opening_balance_today；以实际返回为准并回报差异
        for f in ("open_today_bal", "opening_balance_today", "close_today_bal"):
            v = _to_float(row.get(f))
            if v is not None:
                dp.value = v
                dp.extra["field_used"] = f
                break
        dp.as_of = row.get("record_date")
        dp.extra["account_type"] = row.get("account_type")
    return check_freshness(dp, max_staleness_days)


def fetch_avg_rate(max_staleness_days: int = 45) -> DataPoint:
    """平均发行利率（r vs g 判据的 r）。取 Total Marketable。"""
    row = _latest_row("v2/accounting/od/avg_interest_rates",
                      filters="security_desc:eq:Total Marketable")
    dp = DataPoint(key="avg_rate", value=None, as_of=None,
                   source="FiscalData:avg_interest_rates(Total Marketable)", tier=1,
                   fetched_at=now_iso(), unit="%")
    if row:
        dp.value = _to_float(row.get("avg_interest_rate_amt"))
        dp.as_of = row.get("record_date")
        dp.extra["security_desc"] = row.get("security_desc")
    return check_freshness(dp, max_staleness_days)


def fetch_all(sources: dict) -> list:
    out = []
    fns = {"debt_total": fetch_debt_total, "tga_daily": fetch_tga_daily,
           "avg_rate": fetch_avg_rate}
    for key, cfg in sources.items():
        if cfg.get("provider") != "fiscaldata":
            continue
        try:
            out.append(fns[key](cfg.get("max_staleness_days", 7)))
        except Exception as e:
            out.append(DataPoint(key=key, value=None, as_of=None,
                                 source="FiscalData", tier=1, fetched_at=now_iso(),
                                 stale=True, stale_reason=f"fetch_error:{type(e).__name__}:{e}"))
    return out
