"""TIC 主要外国持有人（Major Foreign Holders of Treasury Securities）。

数据源差异回报（2026-08-26实测，规格书§4.3的URL已过时）：
- 规格书给的 mfhhis01.txt 是年度历史文件（最新块=2025整年）
- mfh.txt 当时拉到的是旧缓存（2023-01）
- 实际当前月度数据在 slt_table5.txt：tab分隔、表头为 "2026-06" 式 ISO 年月，
  含近13个月列。本模块以此为唯一数据源。

新鲜度：与官方发布日程比对（behind_schedule 检测）。
2026年发布日：1/15, 2/18, 3/18, 4/15, 5/18, 6/18, 7/14, 8/17, 9/16, 10/16, 11/18, 12/15。
规则：若今天 ≥ 本月发布日 → 应有"上上个月"数据；否则应有"上上上个月"。
"""
from __future__ import annotations

import calendar
import datetime as dt

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://ticdata.treasury.gov/Publish/slt_table5.txt"

# 官方2026发布日（月->日）。2027年起需更新（H1_stale 会先兜底报警）
RELEASE_DAYS = {1: 15, 2: 18, 3: 18, 4: 15, 5: 18, 6: 18,
                7: 14, 8: 17, 9: 16, 10: 16, 11: 18, 12: 15}

COUNTRIES = {"Japan": "japan", "United Kingdom": "uk", "China, Mainland": "china"}


def _month_end(year: int, month: int) -> dt.date:
    return dt.date(year, month, calendar.monthrange(year, month)[1])


def _shift_month(year: int, month: int, delta: int) -> tuple[int, int]:
    m = year * 12 + (month - 1) + delta
    return m // 12, m % 12 + 1


def expected_tic_month(today: dt.date) -> dt.date:
    """按官方日程，今天应有的最新数据月份（返回月末日期）。"""
    release_day = RELEASE_DAYS.get(today.month, 16)
    lag = -2 if today.day >= release_day else -3
    y, m = _shift_month(today.year, today.month, lag)
    return _month_end(y, m)


def parse_table5(text: str) -> dict:
    """解析 slt_table5.txt。返回 {as_of, columns, rows:{country:[floats]}}。
    注意 'China, Mainland' 带逗号——文件是tab分隔，不按逗号切分。
    """
    lines = [l.rstrip() for l in text.splitlines()]
    header = None
    rows = {}
    for l in lines:
        cells = [c.strip().strip('"') for c in l.split("\t")]
        if cells[0] == "Country":
            header = [c for c in cells[1:] if c]        # ['2026-06', '2026-05', ...]
            continue
        if header is None or not cells[0]:
            continue
        name = cells[0]
        if name in COUNTRIES:
            vals = []
            for c in cells[1:len(header) + 1]:
                try:
                    vals.append(float(c))
                except ValueError:
                    vals.append(None)
            rows[name] = vals
    if not header:
        raise ValueError("Country header row not found — format changed, report upstream")
    y, m = map(int, header[0].split("-"))
    return {"as_of": _month_end(y, m).isoformat(), "columns": header, "rows": rows}


def fetch(max_staleness_days: int = 75, today: dt.date | None = None) -> list[DataPoint]:
    """返回每国一个 DataPoint：value=最新持仓(bn)，extra 含环比与近13月序列。"""
    today = today or dt.date.today()
    fetched = now_iso()
    try:
        parsed = parse_table5(http_get(URL, as_json=False))
    except Exception as e:
        return [DataPoint(key=f"tic_{slug}", value=None, as_of=None,
                          source=f"TIC:{URL}", tier=1, fetched_at=fetched,
                          stale=True, stale_reason=f"fetch_error:{type(e).__name__}:{e}")
                for slug in COUNTRIES.values()]

    out = []
    for name, slug in COUNTRIES.items():
        vals = parsed["rows"].get(name)
        dp = DataPoint(key=f"tic_{slug}", value=None, as_of=parsed["as_of"],
                       source="TIC:slt_table5", tier=1, fetched_at=fetched, unit="bn")
        if vals and vals[0] is not None:
            dp.value = vals[0]
            if len(vals) > 1 and vals[1] is not None:
                dp.extra["chg_bn"] = round(vals[0] - vals[1], 1)
            dp.extra["country"] = name
            dp.extra["series"] = [
                [f"{c}-01", v] for c, v in zip(parsed["columns"], vals) if v is not None
            ][::-1]  # 旧->新
        out.append(check_freshness(dp, max_staleness_days,
                                   expected_schedule=expected_tic_month, today=today))
    return out
