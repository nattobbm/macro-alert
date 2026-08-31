"""伦敦金现 XAUUSD（判定层用）。

为什么单独一个源：2026-08-31 发现的判定口径错误——
黄金警戒带 4450–4700 在 8-25 报告里写的是「**XAUUSD** 4,450–4,700」，
但规则引擎一直拿 COMEX 期货(GC=F)去量它。两者差约50美元，
导致离下界的距离被系统性低估约1个百分点：
    COMEX 4508 → 离下界 1.30%（显示"安静"）
    XAUUSD 4458 → 离下界 0.18%（几乎贴线）
这是"期货≠现货"在判定层的渗透，与显示层同源错误。

为什么用这个源：免费的官方级现货金源不存在——
    FRED 的 LBMA 定盘价序列(GOLDAMGBD228NLBM等) 已停更，API返回400
    yfinance 无现货代码（XAUUSD=X / XAU=X 均404）
    Stooq xauusd 404
    metals.dev / exchangerate.host 需密钥
剩下可用且免密钥的是 fawazahmed0/currency-api（CC0开源汇率数据集，
走 jsDelivr CDN，日频）。它是二手数据，因此：
  - tier 定为 2，且**强制与 COMEX 交叉校验**：基差落在合理区间外即判 stale，
    宁可不判定也不拿可疑数触发警报（沿用 8-17 事故的教训）
  - 实时显示另走腾讯 hf_XAU（前端 liveQuote.ts），与本源互为对账
    （2026-08-31 实测两源差 $1.3）
"""
from __future__ import annotations

import datetime as dt

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/xau.json"
URL_INV = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json"
TX = "https://qt.gtimg.cn/q=hf_XAU"
# 跨源分歧上限(%)。2026-08-31实测：同一数据集两端点相差$38（日期不同步），
# 且三源对"是否破4450下界"给出相反结论。这类分歧下宁可不判定。
MAX_SPREAD_PCT = 0.40
# COMEX期货 − 伦敦金现 的合理基差区间（美元）。由持有成本决定：
# 利率5%、金价4500、2-3个月到期 → 约 $37-56。留宽到 10-120 只挡明显异常，
# 不做精细判断——目的是拦住"源给了个离谱数"，不是预测基差。
BASIS_MIN, BASIS_MAX = 10.0, 120.0


def fetch(comex_price: float | None = None, max_staleness_days: int = 5) -> DataPoint:
    dp = DataPoint(key="xauusd", value=None, as_of=None,
                   source="currency-api:xau(CC0)", tier=2,
                   fetched_at=now_iso(), unit="usd")
    try:
        js = http_get(URL, timeout=25)
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:60]}"
        return dp

    quotes: dict[str, tuple[float, str]] = {}
    v = (js.get("xau") or {}).get("usd")
    if isinstance(v, (int, float)) and 500 < v < 50000:
        quotes["currency-api:xau"] = (float(v), str(js.get("date") or "")[:10])

    # 同数据集的反向端点（两端点日期常不同步，取新的那个）
    try:
        j2 = http_get(URL_INV, timeout=20)
        u = (j2.get("usd") or {}).get("xau")
        if isinstance(u, (int, float)) and u > 0:
            quotes["currency-api:usd_inv"] = (1 / u, str(j2.get("date") or "")[:10])
    except Exception:
        pass

    # 第三方对账（腾讯外盘，服务端可达）。只用于校验，不作为取值来源。
    try:
        raw = http_get(TX, timeout=20, as_json=False)
        f = raw.split('"')[1].split(",")
        tv = float(f[0])
        if 500 < tv < 50000:
            quotes["tencent:hf_XAU"] = (tv, (f[12] if len(f) > 12 else ""))
    except Exception:
        pass

    if not quotes:
        dp.stale = True
        dp.stale_reason = "no_quote_from_any_source"
        return dp

    dp.extra["quotes"] = {k: {"value": round(a, 2), "date": b} for k, (a, b) in quotes.items()}
    vals = [a for a, _ in quotes.values()]
    spread_pct = (max(vals) - min(vals)) / min(vals) * 100
    dp.extra["spread_pct"] = round(spread_pct, 3)

    # 取日期最新的那条作为值（同数据集两端点日期常差一天）
    best = max(quotes.items(), key=lambda kv: (kv[1][1], kv[0] != "tencent:hf_XAU"))
    dp.value = round(best[1][0], 2)
    dp.as_of = best[1][1] or dt.date.today().isoformat()
    dp.extra["picked"] = best[0]

    # 跨源分歧过大 → 不判定（沿用 H2_sofr_conflict：不静默择一）
    if len(vals) > 1 and spread_pct > MAX_SPREAD_PCT:
        dp.stale = True
        dp.stale_reason = (f"source_conflict({spread_pct:.2f}%>"
                           f"{MAX_SPREAD_PCT}%): " +
                           " / ".join(f"{k.split(':')[0]}={a:.0f}" for k, (a, _) in quotes.items()))
        return dp

    # 与 COMEX 交叉校验：基差离谱 → 判 stale，不参与规则
    if comex_price:
        basis = comex_price - dp.value
        dp.extra["comex"] = comex_price
        dp.extra["basis"] = round(basis, 2)
        if not (BASIS_MIN <= basis <= BASIS_MAX):
            dp.stale = True
            dp.stale_reason = (f"basis_out_of_range({basis:.1f}，"
                               f"合理区间{BASIS_MIN}-{BASIS_MAX})")
            return dp
    return check_freshness(dp, max_staleness_days)
