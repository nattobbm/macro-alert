"""Kalshi 9月Fed决议市场（CFTC 监管的美国预测市场；公开行情接口免密钥、免账号）。

⚠ 2026-09-12 同日撤下（monitor.KALSHI_PUBLIC = False），代码保留。
读了《Kalshi Data Terms of Use》（kalshi-public-docs.s3.amazonaws.com/kalshi-data-terms-of-service.pdf）原文：
  I. 只许 "personal use for non-commercial purposes"；
  II. 未经书面授权禁止 "publicly displaying, publishing, ... distributing, disseminating" 任何 Kalshi Data，
      也禁止 "providing archived or cached data sets containing Kalshi Data to another person or entity"。
本站和 data/ 都公开，所以取数一并停。API Developer Agreement（kalshi.com/developer-agreement）
被 Vercel 人机验证挡住没读到，按最严的一份执行。拿到书面许可再开。

2026-09-12 接入，为"三方对照"服务：市场怎么押 / 我们怎么判 / 叙事怎么说，到期一起结算。

口径：事件合约的 YES 价，**买一卖一中间价**当概率（没有盘口时退回最新成交价）。
和 Polymarket 一样是"另一个场子"，只并列参照，**不顶替主源 ZQ**（选源规则在 monitor.build_ctx）。
2026-09-12 实测：加25bp 0.80/0.81、维持 0.20/0.21，两条腿成交量 $11.3M / $26.8M。

接口备注：v2 的价格字段已经换成带 `_dollars` 后缀的字符串（"0.8000"），
旧的整数美分字段（yes_bid / last_price）全部返回 null。读错字段会拿到一堆 None。

本站只读不交易，数据带来源标注展示；不做撮合、不做代客下单。
"""
from __future__ import annotations

import datetime as dt

from .base import DataPoint, check_freshness, http_get, now_iso

BASE = "https://api.elections.kalshi.com/trade-api/v2"
EVENT = "KXFEDDECISION-26SEP"
# 合约代号尾巴 → 人话腿名。H0 = 不动，H25 = 加25，C25 = 降25，H26/C26 = 超过25
LEGS = {"H25": "hike25", "H0": "hold", "C25": "cut25", "H26": "hike50p", "C26": "cut50p"}


def _f(x):
    try:
        return float(x) if x is not None and x != "" else None
    except (TypeError, ValueError):
        return None


def _mid(m: dict):
    b, a, last = _f(m.get("yes_bid_dollars")), _f(m.get("yes_ask_dollars")), _f(m.get("last_price_dollars"))
    if b is not None and a is not None and a >= b:
        return (a + b) / 2
    return last


def fetch(max_staleness_days: int = 3) -> DataPoint:
    dp = DataPoint(key="kalshi_sep_hike", value=None, as_of=None,
                   source=f"Kalshi:{EVENT}", tier=2,
                   fetched_at=now_iso(), unit="prob")
    try:
        js = http_get(f"{BASE}/markets", {"event_ticker": EVENT, "limit": 20})
        dist, vol = {}, {}
        for m in js.get("markets", []):
            leg = LEGS.get((m.get("ticker") or "").rsplit("-", 1)[-1])
            if not leg:
                continue
            p = _mid(m)
            if p is None:
                continue
            dist[leg] = round(p, 3)
            v = _f(m.get("volume_fp"))
            if v is not None:
                vol[leg] = round(v / 1e6, 2)
        if "hike25" not in dist:
            dp.stale = True
            dp.stale_reason = "market_not_found"
            return dp
        dp.value = dist["hike25"]
        dp.as_of = dt.date.today().isoformat()
        dp.extra = {"dist": dist, "volume_mn": vol,
                    "note": "买一卖一中间价当概率。CFTC监管的美国场子，与ZQ期货/Polymarket口径不同，仅并列参照"}
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp
    return check_freshness(dp, max_staleness_days)


if __name__ == "__main__":       # 手查用
    d = fetch()
    print(d.key, d.value, d.as_of, "stale" if d.stale else "ok", d.stale_reason, d.extra)
