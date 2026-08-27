"""CBOE 免费延迟期权链 → 做市商 GEX（gamma exposure）。

数据源：cdn.cboe.com 延迟15-20分钟，无需key，含每张合约 gamma/delta/OI/IV。
方法：Perfiliev 标准做法的近似版
    每张合约 $gamma = gamma × OI × 100 × spot² × 0.01   （每1%位移的美元gamma）
    符号启发式：做市商 long call(+) / short put(−) —— 这是全行业通用但不可验证的
    建模假设（K:GEX建模依赖），看板必须标注，不同平台符号可能相反。
输出：净GEX、gamma flip（按行权价累计过零近似）、call墙/put墙、0DTE子集。
每日快照存 data/gex/YYYY-MM-DD.json —— 为周期回测Phase 2的gamma分区变量积累历史。
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path
from zoneinfo import ZoneInfo

from .base import DataPoint, check_freshness, http_get, now_iso

URL = "https://cdn.cboe.com/api/global/delayed_quotes/options/_SPX.json"
SYM = re.compile(r"^(SPXW?)(\d{6})([CP])(\d{8})$")


def _parse(sym: str):
    m = SYM.match(sym)
    if not m:
        return None
    root, ymd, cp, strike = m.groups()
    return {
        "expiry": f"20{ymd[:2]}-{ymd[2:4]}-{ymd[4:6]}",
        "cp": cp,
        "strike": int(strike) / 1000.0,
    }


def _flip_reprice(chain: dict, today_et: str, spot: float) -> float | None:
    """Perfiliev法：现价±5%网格上用BS重算各合约gamma，求净$gamma过零点。"""
    import numpy as np
    K, T, IV, W = [], [], [], []
    today = dt.date.fromisoformat(today_et)
    for o in chain.get("options", []):
        meta = _parse(o.get("option", ""))
        if not meta:
            continue
        iv = o.get("iv") or 0.0
        oi = o.get("open_interest") or 0.0
        # iv为小数(0.1242=12.42%)；深度ITM会出5.0+的垃圾IV，过滤
        if not (0.03 <= iv <= 2.0) or oi <= 0:
            continue
        days = (dt.date.fromisoformat(meta["expiry"]) - today).days
        if days < 0:
            continue
        K.append(meta["strike"])
        T.append(max(days, 0.5) / 365.0)
        IV.append(iv)
        W.append(oi * (1.0 if meta["cp"] == "C" else -1.0))
    if not K:
        return None
    K, T, IV, W = map(np.asarray, (K, T, IV, W))
    levels = spot * np.linspace(0.95, 1.05, 41)
    net = np.empty(len(levels))
    for i, s in enumerate(levels):
        d1 = (np.log(s / K) + 0.5 * IV * IV * T) / (IV * np.sqrt(T))
        gamma = np.exp(-0.5 * d1 * d1) / (np.sqrt(2 * np.pi) * s * IV * np.sqrt(T))
        net[i] = float(np.sum(gamma * W) * s * s * 0.01 * 100)
    sign = np.sign(net)
    for i in range(len(levels) - 1):
        if sign[i] < 0 <= sign[i + 1]:
            x0, x1, y0, y1 = levels[i], levels[i + 1], net[i], net[i + 1]
            return round(float(x0 + (x1 - x0) * (-y0) / (y1 - y0)), 1)
    return None   # ±5%内无过零（全正或全负gamma）


def compute_gex(chain: dict, today_et: str) -> dict:
    spot = float(chain["current_price"])
    dollar = spot * spot * 0.01 * 100 / 1e9   # 每张合约每1%位移的 $bn 系数（×gamma×OI）

    by_strike: dict[float, list[float]] = {}   # strike -> [call_gex, put_gex]
    total = total_0dte = 0.0
    n_used = 0
    for o in chain.get("options", []):
        meta = _parse(o.get("option", ""))
        if not meta:
            continue
        gamma = o.get("gamma") or 0.0
        oi = o.get("open_interest") or 0.0
        if not gamma or not oi:
            continue
        gex = gamma * oi * dollar * (1 if meta["cp"] == "C" else -1)
        s = meta["strike"]
        rec = by_strike.setdefault(s, [0.0, 0.0])
        rec[0 if meta["cp"] == "C" else 1] += gex
        total += gex
        if meta["expiry"] == today_et:
            total_0dte += gex
        n_used += 1

    strikes = sorted(by_strike)
    flip = _flip_reprice(chain, today_et, spot)

    # 墙：现价±12%窗口内
    window = [s for s in strikes if abs(s - spot) / spot <= 0.12]
    call_wall = max(window, key=lambda s: by_strike[s][0], default=None)
    put_wall = min(window, key=lambda s: by_strike[s][1], default=None)

    profile = [[s, round(by_strike[s][0], 3), round(by_strike[s][1], 3)]
               for s in window if abs(by_strike[s][0]) + abs(by_strike[s][1]) > 0.01]

    return {
        "spot": spot, "date": today_et,
        "net_gex_bn": round(total, 2), "gex_0dte_bn": round(total_0dte, 2),
        "flip": flip, "call_wall": call_wall, "put_wall": put_wall,
        "n_contracts_used": n_used,
        "profile": profile,
        "assumption": "dealer long call/short put启发式；flip=BS重定价法(±5%网格,41点)",
    }


def fetch(archive_dir: str | Path, max_staleness_days: int = 3) -> DataPoint:
    dp = DataPoint(key="gex_net", value=None, as_of=None,
                   source="CBOE:delayed_quotes(_SPX)", tier=1,
                   fetched_at=now_iso(), unit="bn$/1%")
    today_et = dt.datetime.now(ZoneInfo("America/New_York")).date().isoformat()
    try:
        js = http_get(URL, timeout=60)
        gex = compute_gex(js["data"], today_et)
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{str(e)[:80]}"
        return dp

    dp.value = gex["net_gex_bn"]
    dp.as_of = today_et
    dp.extra = {k: v for k, v in gex.items() if k != "profile"}
    dp.extra["profile"] = gex["profile"]

    # 每日快照存档（回测资产：从今天起积累gamma分区历史）
    arch = Path(archive_dir)
    arch.mkdir(parents=True, exist_ok=True)
    (arch / f"{today_et}.json").write_text(
        json.dumps(gex, ensure_ascii=False), encoding="utf-8")
    return check_freshness(dp, max_staleness_days)
