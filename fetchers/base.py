"""统一返回结构 + 新鲜度校验。

硬约束（规格书§0）：
1. 所有数字必须携带 source 和 as_of，缺一不可
2. 进入规则引擎前必须通过新鲜度断言；stale 数据不参与判定
"""
from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, asdict, field
from typing import Optional, Callable

# 密钥脱敏：2026-08-27 事故——FRED抓取失败时 requests 把完整URL(含api_key)写进
# 异常文本 → 存进 stale_reason → 随 data/latest.json 提交进公开仓库，泄露FRED密钥。
# 凡是可能进入持久化字段或日志的外部文本，一律先过这里。
_SECRET_PAT = re.compile(
    r"(api_key|apikey|api-key|token|access_token|key|secret|password)"
    r"(=|%3D|:\s*|\"\s*:\s*\")([^&\s\"',)]{8,})", re.IGNORECASE)


def redact(text: str) -> str:
    """把 URL/文本里的密钥值替换成 ***。用于所有错误信息落盘前。"""
    if not text:
        return text
    out = _SECRET_PAT.sub(lambda m: f"{m.group(1)}{m.group(2)}***", str(text))
    # Telegram bot token 形如 123456789:AAH...（URL里常写作 /bot123456789:AAH，
    # 数字前无词边界，故不能用 \b）
    return re.sub(r"\d{8,12}:[A-Za-z0-9_-]{30,}", "***", out)


@dataclass
class DataPoint:
    key: str                  # 指标名，如 "tips10y"
    value: Optional[float]
    as_of: Optional[str]      # 数据本身的日期 YYYY-MM-DD（不是抓取日）
    source: str               # "FRED:DFII10"
    tier: int                 # 1=一手官方 2=官方镜像 3=手动 4=其他
    fetched_at: str           # ISO8601 抓取时刻
    stale: bool = False
    stale_reason: str = ""
    unit: str = ""
    extra: dict = field(default_factory=dict)   # 附加结构化数据（序列、成分等）

    def __setattr__(self, name, value):
        # stale_reason 是唯一会把外部异常文本落盘的字段，在赋值口做兜底脱敏，
        # 这样任何 fetcher 忘记手动调 redact() 也不会再泄露密钥。
        if name == "stale_reason" and value:
            value = redact(value)
        object.__setattr__(self, name, value)

    def to_dict(self):
        return asdict(self)


def now_iso() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def check_freshness(dp: DataPoint, max_staleness_days: int,
                    expected_schedule: Optional[Callable[[dt.date], dt.date]] = None,
                    today: Optional[dt.date] = None) -> DataPoint:
    """新鲜度校验。所有 fetcher 返回前必须调用。

    max_staleness_days: as_of 距今超过该天数 → stale
    expected_schedule: 可选。f(today) -> 按官方日程今天应有的最新数据日期；
                       as_of < 该日期 → stale, reason="behind_schedule"
    today: 测试注入用，默认取当天
    """
    today = today or dt.date.today()

    if dp.value is None:
        dp.stale = True
        dp.stale_reason = dp.stale_reason or "no_value"
        return dp
    if not dp.as_of:
        dp.stale = True
        dp.stale_reason = "missing_as_of"
        return dp

    as_of = dt.date.fromisoformat(dp.as_of)

    # 日程判定优先：behind_schedule 比"超龄"信息量更高（验收项4）
    if expected_schedule is not None:
        expected = expected_schedule(today)
        if expected is not None and as_of < expected:
            dp.stale = True
            dp.stale_reason = f"behind_schedule(as_of={as_of},expected>={expected})"
            return dp

    age = (today - as_of).days
    if age > max_staleness_days:
        dp.stale = True
        dp.stale_reason = f"exceeds_max_staleness({age}d>{max_staleness_days}d)"
        return dp

    dp.stale = False
    return dp


def http_get(url: str, params: dict | None = None, timeout: int = 30,
             as_json: bool = True):
    """统一 GET：常规 UA（TreasuryDirect 会拒默认 UA）+ 抛错。"""
    import requests
    r = requests.get(url, params=params, timeout=timeout, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) macro-alert/2.0",
        "Accept": "application/json,text/plain,*/*",
    })
    r.raise_for_status()
    return r.json() if as_json else r.text
