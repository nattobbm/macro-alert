#!/usr/bin/env python3
"""macro-alert v2 主入口。

用法:
    python monitor.py              # 抓数 + 规则判定 + 写 data/ + TG推送
    python monitor.py --dry-run    # 全流程但只打印不推送
    python monitor.py --no-fetch   # 用上次 snapshot 重跑引擎（调试规则用）

环境变量: FRED_API_KEY, EIA_API_KEY(可选), TG_BOT_TOKEN, TG_CHAT_ID
本地开发: 自动读 .env
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).parent
sys.path.insert(0, str(ROOT))

from fetchers import fred, fiscaldata, tic, treasurydirect, cftc, nyfed, eia, market, manual, news, cboe_gex, fedwatch_zq, polymarket, econ_calendar, spot_gold, jin10_flash  # noqa: E402
from fetchers.base import DataPoint  # noqa: E402
from core import engine, notify, predict, reason  # noqa: E402

DATA = ROOT / "data"
STATE_FILE = DATA / "state.json"
LATEST_FILE = DATA / "latest.json"

LABELS = {
    "tips10y": "真利率(扣通胀)", "us10y": "10年国债利率", "us30y": "30年国债利率",
    "us20y": "20年国债利率", "curve_10y2y": "利率曲线(10Y-2Y)", "breakeven10": "物价预期(债市定价)",
    "sofr": "隔夜借钱利率SOFR", "iorb": "准备金利率IORB", "rrp": "隔夜逆回购RRP(备用资金)", "fed_assets": "美联储总资产",
    "tga": "财政部账户TGA(周)", "m2": "货币供应量M2", "debt_total": "联邦债务总额", "tga_daily": "财政部账户TGA(日)",
    "avg_rate": "政府借钱平均利息",
    "sahm_rule": "衰退报警器(萨姆规则)", "unrate": "失业率", "icsa": "初请失业金(周)",
    "core_pce": "核心物价指数PCE", "gdp_real": "实际GDP", "gdp_pot": "潜在GDP(CBO)",
    "fedfunds": "联邦基金利率(月均)", "kr_rate": "韩国政策利率", "jp_rate": "日本政策利率",
    "tic_japan": "日本持有美债", "tic_uk": "英国持有美债",
    "tic_china": "中国持有美债", "cot_gold": "黄金大户净多单", "cot_silver": "白银大户净多单",
    "cot_jpy": "日元大户净多单", "repo_ops": "常备回购SRF用量", "sofr_nyfed": "SOFR(纽约联储版)",
    "crude_stocks": "原油库存", "spx": "美股大盘SPX", "vix": "恐慌指数VIX", "vix3m": "3月期VIX",
    "hy_oas": "高收益债利差", "ccc_oas": "CCC级利差", "bank_tight": "银行收紧放贷%",
    "quality_spread": "质量利差(CCC−HY)", "nvda": "英伟达", "sox": "费城半导体指数",
    "gold": "黄金(COMEX期货)", "xauusd": "黄金(伦敦金现XAUUSD)",
    "silver": "白银", "platinum": "铂金", "dxy": "美元指数",
    "usdjpy": "美元兑日元", "brent": "油价Brent", "wti": "油价WTI", "move": "债市恐慌指数MOVE",
    "auctions": "国债拍卖认购", "gex_net": "做市商GEX", "fedwatch_zq_sep": "9月加息概率(期货算)", "polymarket_sep_hike": "9月加息概率(押注市场)", "fedwatch_sep_hike": "9月加息概率(手动)",
    "fima_weekly_usd": "外国央行借美元(FIMA)", "war_risk_premium": "战争险费率(手动)",
    "auction_tail_bp": "拍卖尾差(手动)",
}

LABELS_EN = {
    "tips10y": "Real Yield (10Y TIPS)", "us10y": "10Y Treasury", "us30y": "30Y Treasury",
    "us20y": "20Y Treasury", "curve_10y2y": "Yield Curve (10Y-2Y)", "breakeven10": "Breakeven Inflation (10Y)",
    "sofr": "SOFR Overnight Rate", "iorb": "IORB Floor Rate", "rrp": "Reverse Repo (RRP)", "fed_assets": "Fed Balance Sheet",
    "tga": "Treasury Account (W)", "m2": "Money Supply M2", "debt_total": "Total Public Debt", "tga_daily": "Treasury Account (D)",
    "avg_rate": "Avg Interest on Debt",
    "sahm_rule": "Sahm Rule (Recession Gauge)", "unrate": "Unemployment Rate", "icsa": "Initial Claims (W)",
    "core_pce": "Core PCE Index", "gdp_real": "Real GDP", "gdp_pot": "Potential GDP (CBO)",
    "fedfunds": "Fed Funds Rate (Mo Avg)", "kr_rate": "Korea Policy Rate", "jp_rate": "Japan Policy Rate",
    "tic_japan": "Japan UST Holdings", "tic_uk": "UK UST Holdings",
    "tic_china": "China UST Holdings", "cot_gold": "Gold Net Longs (COT)", "cot_silver": "Silver Net Longs (COT)",
    "cot_jpy": "JPY Net Longs (COT)", "repo_ops": "SRF Usage", "sofr_nyfed": "SOFR (NY Fed)",
    "crude_stocks": "Crude Inventories", "spx": "S&P 500", "vix": "VIX Fear Index", "vix3m": "VIX 3M",
    "hy_oas": "High Yield OAS", "ccc_oas": "CCC OAS", "bank_tight": "Banks Tightening %",
    "quality_spread": "Quality Spread (CCC-HY)", "nvda": "NVIDIA", "sox": "PHLX Semiconductor",
    "gold": "Gold (COMEX futures)", "xauusd": "Gold (XAUUSD spot)",
    "silver": "Silver", "platinum": "Platinum", "dxy": "Dollar Index",
    "usdjpy": "USD/JPY", "brent": "Brent Oil", "wti": "WTI Oil", "move": "MOVE Bond Vol",
    "auctions": "Auction Bid-to-Cover", "gex_net": "Dealer GEX", "fedwatch_zq_sep": "Sep Hike Odds (Futures)",
    "polymarket_sep_hike": "Sep Hike Odds (Polymarket)", "fedwatch_sep_hike": "Sep Hike Odds (Manual)",
    "fima_weekly_usd": "FIMA Repo Usage", "war_risk_premium": "War Risk Premium (Manual)",
    "auction_tail_bp": "Auction Tail (Manual)",
}

RADAR_EN = {
    "30年利率回前高": "30Y back to prior high", "30年利率失控区": "30Y danger zone",
    "银行缺现金(SOFR冒头)": "Reserve scarcity (SOFR>IORB)", "加息预期回升": "Hike odds rebound",
    "加息预期崩落": "Hike odds collapse", "日元弱到官方干预线": "JPY at intervention line",
    "日元强到撤资线": "JPY at carry-unwind line", "黄金冲上界": "Gold upper break",
    "黄金跌下界": "Gold lower break", "油价出上界": "Oil above band", "油价出下界": "Oil below band",
    "恐慌指数进应激区": "VIX stress zone", "债市恐慌指数爆表": "MOVE breakout",
    "黄金大户仓位极端": "Gold COT extreme", "利息增速追上收入增速": "r catching up to g",
    "跌破gamma翻转位(波动放大区)": "Below gamma flip (neg gamma)",
    "升破上方期权密集位(call墙)": "Above call wall",
    "跌破下方期权密集位(put墙)": "Below put wall",
    "衰退报警器(萨姆规则)": "Sahm rule (recession gauge)",
    "央行欠账的紧缩(泰勒缺口)": "Taylor gap (repression gauge)",
}

# 警戒线来源四分类（回答"阈值有没有标准"：每条线的出处都在 rules.yaml，此处做展示用短语）
RADAR_ORIGIN = {
    "30年利率回前高":       ("真出过事的位置 · 8-18创下19年最高5.33%", "Event level: Aug-18 19yr high 5.33%"),
    "30年利率失控区":       ("机制线 · 到这个位置官方通常得出手",     "Mechanism: policy-response level"),
    "银行缺现金(SOFR冒头)": ("机制线 · 银行缺钱最早露头的地方",     "Mechanism: earliest reserve-scarcity signal"),
    "加息预期回升":         ("报告情景区间 · 8-25报告",           "Scenario band: Aug-25 report"),
    "加息预期崩落":         ("报告情景区间 · 8-25报告",           "Scenario band: Aug-25 report"),
    "日元弱到官方干预线":   ("真出过事的位置 · 7-31各国联手干预就在这",       "Event level: Jul-31 joint intervention"),
    "日元强到撤资线":       ("机制线 · 借日元的钱开始撤的位置",         "Mechanism: carry-unwind trigger"),
    "黄金冲上界":           ("报告情景区间 · 8-25报告",           "Scenario band: Aug-25 report"),
    "黄金跌下界":           ("报告情景区间 · 8-25报告",           "Scenario band: Aug-25 report"),
    "油价出上界":           ("报告情景区间 · 区间控制假说(加样中)", "Scenario band: range-control hypothesis"),
    "油价出下界":           ("报告情景区间 · 区间控制假说(加样中)", "Scenario band: range-control hypothesis"),
    "恐慌指数进应激区":     ("统计分位 · 历史应激区间",           "Statistical: historical stress zone"),
    "债市恐慌指数爆表":     ("真出过事的位置 · 上次对冲基金爆仓就在这个水平", "Event level: basis-trade unwind risk"),
    "黄金大户仓位极端":     ("统计分位 · 52周90分位",             "Statistical: 52w 90th percentile"),
    "利息增速追上收入增速": ("机制线 · 利息涨得比收入快，债就开始自己滚大",    "Mechanism: r>g debt-dynamics flip"),
    "跌破gamma翻转位(波动放大区)": ("机制线 · 穿过去，市场的脾气就变了",  "Mechanism: crossing = regime switch"),
    "升破上方期权密集位(call墙)":  ("机制线 · 穿过去，市场的脾气就变了",  "Mechanism: crossing = regime switch"),
    "跌破下方期权密集位(put墙)":   ("机制线 · 穿过去，市场的脾气就变了",  "Mechanism: crossing = regime switch"),
    "衰退报警器(萨姆规则)":       ("统计分位 · 历史高准确率衰退信号", "Statistical: high-accuracy recession signal"),
    "央行欠账的紧缩(泰勒缺口)":   ("机制线 · 该定的利率比实际高出1个百分点以上", "Mechanism: Taylor-implied minus actual >100bp"),
}

# 双边警戒带：一条带子两个出口，通向两条不同推理链（雷达里合并展示）
RADAR_BANDS = [
    {"id": "brent_band", "key": "brent", "lo": 80.0, "hi": 90.0, "unit": "美元",
     "label": "油价(布伦特)", "label_en": "Oil (Brent)",
     "lo_note": "跌破80 → 对手行动更大胆", "hi_note": "涨破90 → 美方倾向缓和",
     "lo_note_en": "Below 80 → adversaries act bolder", "hi_note_en": "Above 90 → US leans to de-escalate",
     "origin": "报告情景区间 · 区间控制假说(加样中)", "origin_en": "Scenario band: range-control hypothesis",
     "rule_id": "G1_oil_band_break"},
    # 口径与阈值同源：8-25报告写的是「XAUUSD 4,450–4,700」，故用伦敦金现不用COMEX期货
    {"id": "gold_band", "key": "xauusd", "lo": 4450.0, "hi": 4700.0, "unit": "美元",
     "label": "黄金(伦敦金现XAUUSD)", "label_en": "Gold (XAUUSD spot)",
     "lo_note": "跌破4450 → 紧缩逻辑回归", "hi_note": "涨破4700 → 上行情景确认",
     "lo_note_en": "Below 4450 → tightening chain returns", "hi_note_en": "Above 4700 → upside scenario confirmed",
     "origin": "报告情景区间 · 8-25报告", "origin_en": "Scenario band: Aug-25 report",
     "rule_id": "X1_gold_breakout"},
    {"id": "jpy_band", "key": "usdjpy", "lo": 157.0, "hi": 163.0, "unit": "",
     "label": "日元(USDJPY)", "label_en": "Yen (USDJPY)",
     "lo_note": "跌破157 → 套息平仓启动(全球撤资)", "hi_note": "涨破163 → 触及7-31官方干预位",
     "lo_note_en": "Below 157 → carry unwind starts", "hi_note_en": "Above 163 → Jul-31 intervention level",
     "origin": "真出过事的位置 + 机制线", "origin_en": "Event level + mechanism",
     "rule_id": "J1_intervention_zone"},
    {"id": "hike_band", "key": "fedwatch_sep_hike", "lo": 0.25, "hi": 0.65, "unit": "",
     "label": "9月加息概率", "label_en": "Sep hike odds",
     "lo_note": "跌破25% → 宽松预期回归，黄金受支撑", "hi_note": "涨破65% → 两个解释框架正面对决",
     "lo_note_en": "Below 25% → easing expectations return", "hi_note_en": "Above 65% → frameworks clash head-on",
     "origin": "报告情景区间 · 8-25报告", "origin_en": "Scenario band: Aug-25 report",
     "rule_id": "F1_hike_odds_up"},
]


def build_radar_bands(ctx: dict) -> list[dict]:
    out = []
    for b in RADAR_BANDS:
        v = ctx.get(b["key"])
        if v is None:
            continue
        lo, hi = b["lo"], b["hi"]
        pos = (v - lo) / (hi - lo)          # <0 破下界, >1 破上界
        status = "breached_lo" if v < lo else "breached_hi" if v > hi \
            else "near" if (pos < 0.1 or pos > 0.9) else "in_band"
        out.append({**b, "value": v, "position": round(max(-0.15, min(1.15, pos)), 4),
                    "dist_lo_pct": round((v - lo) / lo * 100, 2),
                    "dist_hi_pct": round((hi - v) / hi * 100, 2),
                    "status": status})
    return out

# 时序角色（设计书2.1）：领先=预判用 / 同步=确认当前 / 滞后=只能验证不能预测
# 只标有文献依据的，不硬贴
ROLE = {
    "curve_10y2y": "leading", "icsa": "leading", "move": "leading",
    "spx": "coincident",
    "unrate": "lagging", "core_pce": "lagging",
}

GROUPS = {
    "rates": ["tips10y", "us10y", "us30y", "us20y", "curve_10y2y", "breakeven10"],
    "liquidity": ["sofr", "sofr_nyfed", "iorb", "rrp", "fed_assets", "tga", "tga_daily", "m2", "repo_ops"],
    "fiscal": ["debt_total", "avg_rate"],
    "economy": ["sahm_rule", "unrate", "icsa", "core_pce", "gdp_real", "gdp_pot", "fedfunds"],
    "tic": ["tic_japan", "tic_uk", "tic_china"],
    "positioning": ["cot_gold", "cot_silver", "cot_jpy"],
    "market": ["spx", "vix", "vix3m", "gold", "xauusd", "silver", "platinum", "dxy", "usdjpy", "brent", "wti", "move"],
    # fima_weekly_usd 已于 2026-08-31 改为 FRED 自动抓取，移出 manual 组
    "manual": ["fedwatch_sep_hike", "war_risk_premium", "auction_tail_bp"],
}


def load_env():
    envf = ROOT / ".env"
    if envf.exists():
        for line in envf.read_text().splitlines():
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())


def fetch_everything(sources: dict) -> list[DataPoint]:
    dps: list[DataPoint] = []
    dps += fred.fetch_all(sources)
    dps += fiscaldata.fetch_all(sources)
    dps += tic.fetch(sources.get("tic_mfh", {}).get("max_staleness_days", 75))
    dps.append(treasurydirect.fetch(sources.get("auctions", {}).get("max_staleness_days", 30)))
    dps += cftc.fetch_all(sources)
    dps.append(nyfed.fetch_repo_ops())
    dps.append(nyfed.fetch_sofr())
    dps.append(eia.fetch_crude_stocks())
    dps += market.fetch_all(sources.get("market", {}).get("max_staleness_days", 4))
    # 伦敦金现：判定层的黄金口径（8-25报告的4450-4700带子是按XAUUSD定的）。
    # 传入COMEX价做基差交叉校验，基差离谱则判stale不参与规则。
    _gc = next((d.value for d in dps if d.key == "gold" and not d.stale), None)
    dps.append(spot_gold.fetch(comex_price=_gc))
    dps += manual.fetch_all(DATA / "manual.json")
    dps.append(cboe_gex.fetch(DATA / "gex"))
    dps.append(fedwatch_zq.fetch(DATA / "fedwatch"))
    dps.append(econ_calendar.fetch(DATA / "econ_cal"))
    dps.append(polymarket.fetch())
    return dps


def build_ctx(dps: list[DataPoint]) -> tuple[dict, set, list[dict]]:
    """返回 (ctx变量字典, stale_keys, auctions列表)。stale 数据不进 ctx。"""
    by_key = {dp.key: dp for dp in dps}
    stale_keys = {dp.key for dp in dps if dp.stale}
    ctx: dict = {}

    for dp in dps:
        if dp.stale:
            continue
        ctx[dp.key] = dp.value
        if "chg_1d_pct" in dp.extra:
            ctx[f"{dp.key}_1d_pct"] = dp.extra["chg_1d_pct"]
        if "chg_bn" in dp.extra:
            ctx[f"{dp.key}_chg"] = dp.extra["chg_bn"]
        if "pctile_52w" in dp.extra:
            ctx[f"{dp.key}_pctile"] = dp.extra["pctile_52w"]

    # vix_prev_max：近60交易日最高（不含当日）
    vix_dp = by_key.get("vix")
    if vix_dp and not vix_dp.stale and vix_dp.extra.get("series"):
        hist = [v for _, v in vix_dp.extra["series"][:-1]][-60:]
        if hist:
            ctx["vix_prev_max"] = max(hist)

    # 拍卖衍生变量：最近一场长债（20Y/30Y）
    auctions = []
    auc_dp = by_key.get("auctions")
    if auc_dp and not auc_dp.stale:
        auctions = auc_dp.extra.get("auctions", [])
        fred_series = {}
        for k, sk in [("us10y", "DGS10"), ("us30y", "DGS30"), ("us20y", "DGS20")]:
            d = by_key.get(k)
            if d and d.extra.get("series"):
                fred_series[sk] = d.extra["series"]
        treasurydirect.synthesize_tails(auctions, fred_series)

        # 手动tail覆盖最近一场长债
        manual_tail = ctx.get("auction_tail_bp")
        longs = [a for a in auctions
                 if a["term"] and (a["term"].startswith("29-") or a["term"].startswith("30-")
                                   or a["term"].startswith("19-") or a["term"].startswith("20-"))]
        if longs:
            latest = longs[0]
            if manual_tail is not None:
                latest["tail_bp"] = manual_tail
            ctx["long_btc"] = latest["bid_to_cover"]
            ctx["long_indirect_pct"] = latest["indirect_pct"]
            ctx["long_dealer_pct"] = latest["dealer_pct"]
            ctx["long_tail_bp"] = latest["tail_bp"] if latest["tail_bp"] is not None \
                else latest["tail_bp_synthetic"]
            inds = [a["indirect_pct"] for a in longs[:4] if a["indirect_pct"] is not None]
            ctx["indirect_falling_3"] = len(inds) >= 4 and all(
                inds[i] < inds[i + 1] for i in range(3))

    # 质量利差 = CCC级 − 高收益债整体。衡量"最差的借款人是不是在被区别对待"。
    # 2026-08-31：整体HY 2.60（3年分位0.1%，空前低）但CCC 10.26（分位96.3%），
    # 差值7.66（分位99.4%）且单调走阔12个月（5.63→7.66）。
    # 整体利差低是被优质债拉下来的平均数假象——只看总体会把"边缘融资在收紧"读反。
    if ctx.get("ccc_oas") is not None and ctx.get("hy_oas") is not None:
        ctx["quality_spread"] = round(ctx["ccc_oas"] - ctx["hy_oas"], 3)

    # 就业衍生变量（设计书1.1）：初请4周均值环比 / 曲线前60日最低（不含最新）
    icsa_dp = by_key.get("icsa")
    if icsa_dp and not icsa_dp.stale and len(icsa_dp.extra.get("series") or []) >= 8:
        vals = [v for _, v in icsa_dp.extra["series"]]
        m1 = sum(vals[-4:]) / 4
        m0 = sum(vals[-8:-4]) / 4
        if m0:
            ctx["icsa_4wk_chg_pct"] = round((m1 / m0 - 1) * 100, 2)
    curve_dp = by_key.get("curve_10y2y")
    if curve_dp and not curve_dp.stale and len(curve_dp.extra.get("series") or []) >= 2:
        hist = [v for _, v in curve_dp.extra["series"][:-1]][-60:]
        if hist:
            ctx["curve_10y2y_prev_60d_min"] = min(hist)

    # 泰勒缺口（设计书1.2）：应然利率-实际政策利率=央行欠账的紧缩幅度
    # r*=0.75(LW区间0.5-1.0中值，口径必须在看板标注)；产出缺口用GDPC1/GDPPOT按季对齐
    _tay = [by_key.get(k) for k in ("core_pce", "fedfunds", "gdp_real", "gdp_pot")]
    if all(d and not d.stale and d.extra.get("series") for d in _tay):
        pce_dp, ff_dp, gr_dp, gp_dp = _tay
        R_STAR = 0.75
        idx = {d[:7]: v for d, v in pce_dp.extra["series"]}
        yoy = []
        for d, v in pce_dp.extra["series"]:
            y, m = int(d[:4]), int(d[5:7])
            prev = idx.get(f"{y - 1:04d}-{m:02d}")
            if prev:
                yoy.append([d, round((v / prev - 1) * 100, 3)])
        pot = {d: v for d, v in gp_dp.extra["series"]}
        gaps = [[d, round((v - pot[d]) / pot[d] * 100, 3)]
                for d, v in gr_dp.extra["series"] if pot.get(d)]
        ff_m = {d[:7]: v for d, v in ff_dp.extra["series"]}
        series = []
        for d, py in yoy:
            g = None
            for gd, gv in gaps:
                if gd <= d:
                    g = gv
            f = ff_m.get(d[:7])
            if g is None or f is None:
                continue
            need = R_STAR + py + 0.5 * (py - 2.0) + 0.5 * g
            series.append([d, round(need - f, 3)])
        if series:
            ctx["taylor_gap"] = series[-1][1]
            ctx["core_pce_yoy"] = yoy[-1][1]
            ctx["output_gap"] = gaps[-1][1] if gaps else None
            ctx["_taylor_series"] = series[-30:]
            ctx["_taylor_note"] = "r*=0.75(LW区间中值)；π=核心PCE同比；缺口=GDPC1 vs GDPPOT"

    # GEX 衍生变量（雷达用）：距flip/墙的百分比距离
    gex_dp = by_key.get("gex_net")
    if gex_dp and not gex_dp.stale:
        spot = gex_dp.extra.get("spot")
        for name, level in [("flip", gex_dp.extra.get("flip")),
                            ("callwall", gex_dp.extra.get("call_wall")),
                            ("putwall", gex_dp.extra.get("put_wall"))]:
            if spot and level:
                ctx[f"gex_{name}_dist_pct"] = round((spot - level) / spot * 100, 3)

    # 加息概率：取**较新**的那个，不是手动优先。
    # 2026-08-31 事故：手动值停留在 8-26（杰克逊霍尔之前）38.1%，而 ZQ 期货自算
    # 8-27→8-31 从 36.9% 单调升到 69.2%（Warsh讲话+美伊开打的真实重定价）。
    # 旧逻辑"手动优先"让规则一直吃 5 天前的旧数，F1「加息概率回升>65%」该触发未触发。
    # 口径不同必须留痕：ctx 记来源，看板/推送显示"ZQ自算"而非冒充CME读数。
    #
    # 2026-09-01 追加：加保质期 + 收编 Polymarket。
    # 现象：首页「当前剧本」在 0/3 和 1/3 之间来回跳，用户以为网站在乱跳。
    # 真因：ZQ 抓取偶发失败时，静默退回 8-26 的人工值 38.1%(<0.4 → 条件成立)；
    #       ZQ 正常时是 64.6%(不成立)。同一天同一条件，因为抓取成没成而翻面。
    # 处理：① 三源都进候选（Polymarket 是"加息25bp"的YES价，同一件事的另一个场子）
    #       ② 超过 MAX_AGE 天的读数一律不用——宁可显示"没数"，不拿一周前的数冒充今天
    _MAX_AGE_D = 3
    _today = dt.date.today()
    cands = []
    for _k, _label in (("fedwatch_sep_hike", "CME人工读数"),
                       ("fedwatch_zq_sep",   "ZQ期货自算"),
                       ("polymarket_sep_hike", "Polymarket押注")):
        _dp = by_key.get(_k)
        if not _dp or _dp.stale or _dp.value is None or not _dp.as_of:
            continue
        try:
            if (_today - dt.date.fromisoformat(_dp.as_of[:10])).days > _MAX_AGE_D:
                continue        # 过期作废，不进候选
        except ValueError:
            continue
        cands.append((_dp.as_of, _dp.value, _label))
    if cands:
        as_of, val, src = max(cands, key=lambda x: x[0])
        ctx["fedwatch_sep_hike"] = val
        ctx["_fedwatch_source"] = f"{src} as_of={as_of}"
        stale_keys.discard("fedwatch_sep_hike")
        if len(cands) > 1:
            lo, hi = min(c[1] for c in cands), max(c[1] for c in cands)
            # 两源分歧大时留痕（不阻断判定：取新的那个是有依据的选择，但要可查账）
            if hi - lo > 0.10:
                ctx["_fedwatch_conflict"] = "; ".join(
                    f"{s}={v:.1%}({a})" for a, v, s in sorted(cands))
    else:
        # 三个源都过期/都没抓到 → 明确置空。ctx 在上面已经填过原始值，
        # 不清掉的话就会拿过期数继续判定，这正是 0/3↔1/3 来回跳的机制。
        ctx["fedwatch_sep_hike"] = None
        ctx["_fedwatch_source"] = f"三源均超过{_MAX_AGE_D}天，判定按缺数处理"
        stale_keys.add("fedwatch_sep_hike")

    # 数据健康标志（tier1/2 才算；手动源缺录不触发H1）
    tier12_stale = [k for k in stale_keys
                    if by_key[k].tier <= 2 and by_key[k].stale_reason != "missing_EIA_API_KEY"]
    ctx["any_stale"] = len(tier12_stale) > 0
    return ctx, stale_keys, auctions


# 观测点雷达：8-25传导分析报告的最高信息量观测点 + 规则阈值距离
# direction: above=向上突破触发 / below=向下突破触发
RADAR = [
    ("30年利率回前高",       "us30y",            5.33, "above", "T5b_30y_retest"),
    ("30年利率失控区",         "us30y",            5.50, "above", "T5_30y_yield"),
    ("银行缺现金(SOFR冒头)", "_sofr_iorb",   0.03, "above", "T7_sofr_iorb"),
    ("加息预期回升",   "fedwatch_sep_hike", 0.65, "above", "F1_hike_odds_up"),
    ("加息预期崩落",   "fedwatch_sep_hike", 0.25, "below", "F2_hike_odds_down"),
    ("日元弱到官方干预线",       "usdjpy",           163.0, "above", "J1_intervention_zone"),
    ("日元强到撤资线",       "usdjpy",           157.0, "below", "J1b_carry_unwind"),
    # 口径与阈值同源：8-25报告的4450-4700是按XAUUSD定的，不能用COMEX期货量
    ("黄金冲上界",          "xauusd",           4700.0, "above", "X1_gold_breakout"),
    ("黄金跌下界",          "xauusd",           4450.0, "below", "X1_gold_breakout"),
    ("油价出上界",      "brent",            90.0, "above", "G1_oil_band_break"),
    ("油价出下界",      "brent",            80.0, "below", "G1_oil_band_break"),
    ("恐慌指数进应激区",         "vix",              30.0, "above", "S1_vix_regime"),
    ("债市恐慌指数爆表",          "move",             140.0, "above", "T4_move"),
    ("黄金大户仓位极端",       "cot_gold_pctile",  90.0, "above", "P1_cot_extreme"),
    ("利息增速追上收入增速",            "avg_rate",         4.0, "above", "T6_rg_gap"),
    ("衰退报警器(萨姆规则)",            "sahm_rule",        0.5, "above", "E1_sahm_trigger"),
    ("央行欠账的紧缩(泰勒缺口)",        "taylor_gap",       1.0, "above", "F5_taylor_gap"),
    # GEX（距离本身就是%，阈值0=穿越）
    ("跌破gamma翻转位(波动放大区)", "gex_flip_dist_pct",     0.0, "below", "GEX"),
    ("升破上方期权密集位(call墙)",               "gex_callwall_dist_pct", 0.0, "above", "GEX"),
    ("跌破下方期权密集位(put墙)",                "gex_putwall_dist_pct",  0.0, "below", "GEX"),
]


def build_radar(ctx: dict) -> list[dict]:
    vals = dict(ctx)
    if ctx.get("sofr") is not None and ctx.get("iorb") is not None:
        vals["_sofr_iorb"] = round(ctx["sofr"] - ctx["iorb"], 4)
    out = []
    for label, key, thr, direction, rule_id in RADAR:
        v = vals.get(key)
        if v is None:
            continue
        # 距离%：>0 未到阈值，<=0 已突破。阈值0时变量本身已是%距离，分母取100抵消后面的×100
        denom = abs(thr) or 100.0
        dist = (thr - v) / denom if direction == "above" else (v - thr) / denom
        org = RADAR_ORIGIN.get(label, ("", ""))
        out.append({"label": label, "label_en": RADAR_EN.get(label, label), "key": key, "value": v, "threshold": thr,
                    "direction": direction, "rule_id": rule_id,
                    "origin": org[0], "origin_en": org[1],
                    "distance_pct": round(dist * 100, 2)})
    out.sort(key=lambda x: x["distance_pct"])
    return out


def _eval_rule(expr: str, ctx: dict):
    """用simpleeval安全求值失效/复核条件；变量缺失返回None（不判定）"""
    from core.engine import _rule_vars
    from simpleeval import SimpleEval
    needed = _rule_vars(expr)
    if any(ctx.get(v) is None for v in needed):
        return None
    ev = SimpleEval()
    ev.functions["abs"] = abs
    ev.names = {k: ctx[k] for k in needed}
    try:
        return bool(ev.eval(expr))
    except Exception:
        return None


def build_digest(ctx: dict, knowledge: dict, rule_results: list, radar: list,
                 cal: list) -> dict:
    """今日推理快报：与上次运行的状态diff，机械拼装（非AI生成）。
    回答三个问题：什么变了 / 触碰了哪条链 / 下一步看哪。"""
    st_file = DATA / "digest_state.json"
    prev = json.loads(st_file.read_text(encoding="utf-8")) if st_file.exists() else {}
    today = dt.date.today().isoformat()

    # 当前节点状态表 {chain_id.label: status}
    node_now = {}
    for ch in knowledge.get("chains", []):
        for nd in ch.get("nodes", []):
            if nd.get("status") in ("crossed", "near", "quiet", "no_data"):
                node_now[f"{ch['id']}·{nd['label']}"] = nd["status"]

    lines = []
    # 1) 规则新触发
    fired = [r for r in rule_results if r["status"] == "fired"]
    for r in fired:
        lines.append({"icon": "▲", "text": f"规则触发：{r['name']}", "level": "alert"})
    # 2) 链条节点状态变化（对比上次）
    prev_nodes = prev.get("nodes", {})
    order = {"quiet": 0, "near": 1, "crossed": 2}
    for k, now_s in node_now.items():
        old_s = prev_nodes.get(k)
        if old_s and old_s != now_s and now_s in order and old_s in order:
            worse = order[now_s] > order[old_s]
            zh = {"quiet": "安静", "near": "逼近", "crossed": "突破"}
            lines.append({"icon": "↗" if worse else "↘",
                          "text": f"{k}：{zh[old_s]}→{zh[now_s]}",
                          "level": "warn" if worse else "info"})
    # 3) 链条失效
    for ch in knowledge.get("chains", []):
        if ch.get("life") == "falsified" and prev.get("chain_life", {}).get(ch["id"]) != "falsified":
            lines.append({"icon": "⚰", "text": f"链条失效条件触发：{ch['name']}（已沉底待复核）",
                          "level": "alert"})
    # 4) 结论待复核
    for c in knowledge.get("conclusions", []):
        if c.get("live_flag") and c["id"] not in prev.get("flagged", []):
            lines.append({"icon": "⏰", "text": f"结论待复核：{c['claim'][:30]}（{c['live_flag']}）",
                          "level": "warn"})
    if not lines:
        lines.append({"icon": "·", "text": "与上次运行相比无状态变化", "level": "info"})

    # 5) 下一步观测口：距离最近的3个雷达项 + 3日内日历
    watch = [f"{r['label']}（距{abs(r['distance_pct']):.1f}%）"
             for r in radar[:5] if r["distance_pct"] > 0][:3]
    upcoming = [c for c in cal
                if 0 <= (dt.date.fromisoformat(c["date"]) - dt.date.today()).days <= 3]
    next_watch = watch + [f"{c['date']} {c['event']}" for c in upcoming[:2]]
    # 经济日历：3日内High事件并入观测口
    for e in (knowledge.get("_econ_events") or [])[:3]:
        next_watch.append(e)

    st_file.write_text(json.dumps({
        "date": today, "nodes": node_now,
        "chain_life": {ch["id"]: ch.get("life", "active") for ch in knowledge.get("chains", [])},
        "flagged": [c["id"] for c in knowledge.get("conclusions", []) if c.get("live_flag")],
    }, ensure_ascii=False), encoding="utf-8")
    return {"date": today, "lines": lines, "next_watch": next_watch}


def build_knowledge(ctx: dict) -> dict:
    """knowledge/ → 推理页数据：链条节点状态自动判定 + 结论库 + inbox清单。
    节点状态：crossed(已突破,红) / near(距阈值<5%,黄) / quiet(安静,绿) / fact / manual / no_data
    """
    kdir = ROOT / "knowledge"
    out = {"chains": [], "conclusions": [], "inbox": []}

    cf = kdir / "chains.yaml"
    if cf.exists():
        chains = yaml.safe_load(cf.read_text(encoding="utf-8")).get("chains", [])
        for ch in chains:
            nodes = []
            crossed = near = 0
            for nd in ch.get("nodes", []):
                node = {"label": nd["label"], "label_en": nd.get("label_en", ""), "note": nd.get("note", ""), "term": nd.get("term", "")}
                if "metric" in nd:
                    v = ctx.get(nd["metric"])
                    thr, direc = nd["threshold"], nd["direction"]
                    if v is None:
                        node.update(status="no_data", value=None)
                    else:
                        denom = abs(thr) or 100.0
                        dist = (thr - v) / denom if direc == "above" else (v - thr) / denom
                        # 严格不等号：恰好等于阈值不算已穿，与规则引擎的 > / < 保持一致。
                        # 2026-08-31 修：阈值为0的节点（FIMA用量、GEX穿越位）此前用 <=，
                        # 导致 FIMA=0（"没人用"，属安静）被显示成"已穿"，并虚增链条热度。
                        st = "crossed" if dist < 0 else ("near" if dist < 0.05 else "quiet")
                        crossed += st == "crossed"; near += st == "near"
                        node.update(status=st, value=v, threshold=thr,
                                    direction=direc, dist_pct=round(dist * 100, 2),
                                    metric=nd["metric"])
                        # 前提强度：节点写法是"触发=该前提成立"，所以离触发极远
                        # ≠ 只是"安静"，而是"这个前提明确不成立"。
                        # 2026-09-01 起标出来——金融抑制链的核心前提"市场不信央行会加息"
                        # (below 0.4) 现在读数 0.715，前提已被推翻，但旧逻辑只显示"安静"，
                        # 链条看着"没事"，实际是根基没了。
                        if st == "quiet" and dist > 0.5:
                            node["premise"] = "broken"
                else:
                    node.update(status=nd.get("status", "fact"),
                                value_text=nd.get("value_text", ""))
                nodes.append(node)
            # 失效条件自动复核（可绑定的才判；绑不上的=人工复核）
            life = "active"
            if ch.get("falsify_rule") and _eval_rule(ch["falsify_rule"], ctx):
                life = "falsified"
            thr_nodes = [n for n in nodes if n.get("threshold") is not None]
            broken = sum(1 for n in thr_nodes if n.get("premise") == "broken")
            out["chains"].append({
                "id": ch["id"], "name": ch["name"], "name_en": ch.get("name_en", ""), "emoji": ch.get("emoji", ""), "term": ch.get("term", ""), "one_liner": ch.get("one_liner", ""), "one_liner_en": ch.get("one_liner_en", ""), "falsify_en": ch.get("falsify_en", ""),
                "falsify": ch.get("falsify", ""), "nodes": nodes, "life": life,
                "heat": crossed * 2 + near,   # 排序用：越热越靠前
                # 前提计分：成立几个/可判定几个，以及明确被推翻几个
                "premise_hold": crossed, "premise_total": len(thr_nodes),
                "premise_broken": broken,
            })

        # 共享节点去重：同一 metric+阈值+方向 在多条链出现时，它其实是同一个观测点。
        # 此前每条链各算一次热度，导致重复计分（日元/日本持仓在两条链里各算一遍）。
        seen: dict[tuple, list[str]] = {}
        for c in out["chains"]:
            for n in c["nodes"]:
                if n.get("metric") is None:
                    continue
                seen.setdefault((n["metric"], n.get("threshold"), n.get("direction")),
                                []).append(c["id"])
        shared = {k: v for k, v in seen.items() if len(set(v)) > 1}
        for c in out["chains"]:
            dup = 0
            for n in c["nodes"]:
                key = (n.get("metric"), n.get("threshold"), n.get("direction"))
                if key in shared:
                    n["shared_with"] = [x for x in set(shared[key]) if x != c["id"]]
                    if n.get("status") in ("crossed", "near"):
                        dup += 2 if n["status"] == "crossed" else 1
            # 共享部分只在首链全额计分，其余链折半——避免同一个数把多条链一起顶热
            if dup and c["id"] != sorted({x for k in shared for x in shared[k]})[0]:
                c["heat_raw"] = c["heat"]
                c["heat"] = max(0, c["heat"] - dup // 2)

        # 活链按热度；失效链沉底（标记不删除——防僵尸结论复活）
        out["chains"].sort(key=lambda c: (c["life"] == "falsified", -c["heat"]))

    conf = kdir / "conclusions.yaml"
    if conf.exists():
        cons = yaml.safe_load(conf.read_text(encoding="utf-8")).get("conclusions", [])
        today = dt.date.today()
        for c in cons:
            if c.get("date") is not None:
                c["date"] = str(c["date"])
            # 复核器：到期或条件触发 → 标记待复核（沉底，不删除）
            flag = None
            rd = c.get("review_date")
            if rd and today >= (rd if isinstance(rd, dt.date) else dt.date.fromisoformat(str(rd))):
                flag = f"复核日{rd}已到"
            if c.get("review_rule") and _eval_rule(str(c["review_rule"]), ctx):
                flag = f"失效条件触发:{c['review_rule']}"
            if flag:
                c["live_flag"] = flag
            if isinstance(c.get("review_date"), dt.date):
                c["review_date"] = str(c["review_date"])
            # 加样器：假设(加样中)的样本数自动累计
            if c.get("auto_n_dir"):
                n = len(list((DATA / c["auto_n_dir"]).glob("*.json"))) if (DATA / c["auto_n_dir"]).exists() else 0
                c["auto_n"] = n
        # 组内按日期倒序，待复核的整体沉底（稳定排序两步实现）
        cons.sort(key=lambda c: c.get("date", ""), reverse=True)
        cons.sort(key=lambda c: bool(c.get("live_flag")))
        out["conclusions"] = cons

    inbox = kdir / "inbox"
    if inbox.exists():
        for p in sorted(inbox.glob("*.*"), key=lambda p: -p.stat().st_mtime):
            if p.name == "README.md":
                continue
            out["inbox"].append({
                "name": p.name,
                "mtime": dt.datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d"),
                "path": f"knowledge/inbox/{p.name}",
            })
    return out


JUDGE_WIN_D = 7        # 回看窗口（日历日）
JUDGE_TIPS_BP = 6      # 真利率"跳升"的门槛：窗口内 ≥ +6bp
JUDGE_GOLD_PCT = -1.5  # 黄金"同步回落"的门槛：窗口内 ≤ -1.5%


def _judge_regime(series: dict) -> dict | None:
    """把 8-25 报告那条判据真算出来，别只当一句摆设。

    原文：「若实际利率跳升而金不跌 → 确认主导；若金随实际利率同步回落 → 回到需求侧紧缩链」
    这句话一直只是 regime['judge'] 里的静态字符串，从来没被计算过——
    等于我们写了个判据然后从不看它。现在按上面三个常量机械求值。

    只做模板填空，不生成叙事：门槛写死在常量里，结论只有三种可能，一句话也不多编。
    """
    tips = [v for _, v in (series.get("tips10y") or [])]
    gold = [v for _, v in (series.get("gold") or [])]
    if len(tips) < 2 or len(gold) < 2:
        return None
    # 窗口内的首末差。序列已是按日排的，取最后 JUDGE_WIN_D 个点（含节假日空档，宁可短不要长）
    tw, gw = tips[-JUDGE_WIN_D:], gold[-JUDGE_WIN_D:]
    d_tips_bp = round((tw[-1] - tw[0]) * 100, 1)          # 真利率是%，差×100=bp
    d_gold_pct = round((gw[-1] / gw[0] - 1) * 100, 2)
    tips_jumped = d_tips_bp >= JUDGE_TIPS_BP
    gold_fell = d_gold_pct <= JUDGE_GOLD_PCT
    if tips_jumped and gold_fell:
        verdict, plain = "回到需求侧紧缩链", "真利率抬头、黄金跟着跌 —— 这不是金融抑制的样子，是市场在为「更紧」定价。"
    elif tips_jumped and not gold_fell:
        verdict, plain = "确认金融抑制主导", "真利率抬头黄金却没跌 —— 钱在躲，说明大家不信这个利率能维持住。"
    else:
        verdict, plain = "判据未触发", "真利率这几天没明显抬头，这条判据现在还看不出方向。"
    return {"verdict": verdict, "plain": plain,
            "window_days": JUDGE_WIN_D,
            "tips_chg_bp": d_tips_bp, "gold_chg_pct": d_gold_pct,
            "rule": f"真利率{JUDGE_TIPS_BP}bp以上算跳升；黄金{JUDGE_GOLD_PCT}%以下算同步回落"}


def build_regime(ctx: dict, series: dict | None = None) -> dict:
    """主导链判定（8-25报告链条6判据的条件计数版，不做叙事）。"""
    # 条件名写成大白话：看的人没有金融背景，"盈亏平衡通胀>2.8"等于没说。
    # 数字保留在句子里，能对着上面的快照卡自己核。
    conds = [
        ("市场认为9月加息的可能性 低于40%", ctx.get("fedwatch_sep_hike"), lambda v: v < 0.4),
        ("政府借30年的钱，年息 高于5.2%",   ctx.get("us30y"),             lambda v: v > 5.2),
        ("市场押注未来10年物价年涨 高于2.8%", ctx.get("breakeven10"),     lambda v: v > 2.8),
    ]
    # known=False 表示"这条没数"，和"有数但不成立"要分开显示。
    # 两者都画成灰点的话，条件数在 0/3↔1/3 之间跳，看的人只会觉得网站在乱跳。
    detail = [{"cond": name, "value": v, "met": (v is not None and fn(v)),
               "known": v is not None}
              for name, v, fn in conds]
    met = sum(1 for d in detail if d["met"])
    unknown = sum(1 for d in detail if not d["known"])
    return {"name": "通胀偏高但不加息(金融抑制)", "met": met, "total": len(detail),
            "unknown": unknown, "detail": detail,
            "source_note": ctx.get("_fedwatch_source"),
            "plain": "三条同时成立，说明「东西在涨价、政府借钱很贵，但央行还是不打算加息」。"
                     "钱放在银行会被物价慢慢吃掉——历史上这种时候，钱会往黄金和实物跑。",
            "judge_result": _judge_regime(series or {}),
            "judge": "判据(8-25报告)：若实际利率跳升而金不跌→确认主导；若金随实际利率同步回落→回到需求侧紧缩链"}


# 发布日程对账：官方已经发了，我们的数据跟上了吗？
# key = 日历事件人话名（econ_calendar.TITLE_ZH/FRED_KEY 里的），value = 应随之更新的指标
RELEASE_WATCH = {
    "非农就业报告": ["unrate", "sahm_rule"],
    "非农就业人数": ["unrate", "sahm_rule"],
    "失业率": ["unrate", "sahm_rule"],
    "个人收支(含核心PCE)": ["core_pce"],
    "核心PCE物价": ["core_pce"],
    "GDP": ["gdp_real"],
    "美联储资产负债表H.4.1": ["fima_weekly_usd", "fed_assets", "tga"],
    "初请失业金": ["icsa"],
    "职位空缺JOLTS": [],
}
GRACE_DAYS = 2          # 发布后给2天缓冲，避开时区与抓取窗口

# 日历「实际值」自建映射（2026-08-31）
# 背景：ForexFactory 免费feed只有预期/前值没有实际；金十有实际但要登录且
# 页面明文"未经授权不得将资讯数据用于AI训练或其他商业用途"——不碰。
# 做法：实际值从我们已在抓的官方序列现算，发布后FRED自动更新，比二手转发更近源头。
#   (指标key, 变换, 显示格式)
#   level   = 直接取值          level_k = 取值/1000（ICSA是人数）
#   diff_k  = 与上期之差（PAYEMS单位已是千人，差值即"非农新增"）
#   mom_pct = 环比%            yoy_pct = 同比%
ACTUAL_MAP: dict[str, tuple[str, str, str]] = {
    "非农就业人数":        ("payems",   "diff_k",  "{:+.0f}K"),
    "非农就业报告":        ("payems",   "diff_k",  "{:+.0f}K"),
    "失业率":              ("unrate",   "level",   "{:.1f}%"),
    "初请失业金":          ("icsa",     "level_k", "{:.0f}K"),
    "消费者物价CPI(月)":   ("cpi",      "mom_pct", "{:+.1f}%"),
    "消费者物价CPI":       ("cpi",      "mom_pct", "{:+.1f}%"),
    "消费者物价CPI(年)":   ("cpi",      "yoy_pct", "{:.1f}%"),
    "核心CPI(月)":         ("core_cpi", "mom_pct", "{:+.1f}%"),
    "核心CPI(年)":         ("core_cpi", "yoy_pct", "{:.1f}%"),
    "生产者物价PPI(月)":   ("ppi",      "mom_pct", "{:+.1f}%"),
    "生产者物价PPI":       ("ppi",      "mom_pct", "{:+.1f}%"),
    "核心PCE物价":         ("core_pce", "mom_pct", "{:+.1f}%"),
    "个人收支(含核心PCE)": ("core_pce", "mom_pct", "{:+.1f}%"),
    "零售销售(月)":        ("retail",   "mom_pct", "{:+.1f}%"),
    "零售销售":            ("retail",   "mom_pct", "{:+.1f}%"),
}


def _series_map(dp) -> dict[str, float]:
    return {d: v for d, v in (dp.extra.get("series") or [])} if dp else {}


def _compute_actual(dp, period: str, how: str, fmt: str) -> tuple[str, str] | None:
    """按 period(数据周期起始日) 从官方序列算出实际值。返回 (显示串, as_of)。"""
    s = _series_map(dp)
    if not s:
        return None
    dates = sorted(s)
    # 月频：精确匹配周期；周频：取<=周期末的最后一个观测
    if period in s:
        i = dates.index(period)
    else:
        cand = [d for d in dates if d <= period]
        if not cand:
            return None
        i = dates.index(cand[-1])
    cur, d0 = s[dates[i]], dates[i]
    prev = s[dates[i - 1]] if i > 0 else None
    try:
        if how == "level":
            v = cur
        elif how == "level_k":
            v = cur / 1000
        elif how == "diff_k":
            if prev is None:
                return None
            v = cur - prev
        elif how == "mom_pct":
            if not prev:
                return None
            v = (cur / prev - 1) * 100
        elif how == "yoy_pct":
            y, m = int(d0[:4]) - 1, d0[5:7]
            base = s.get(f"{y:04d}-{m}-01")
            if not base:
                return None
            v = (cur / base - 1) * 100
        else:
            return None
        return fmt.format(v), d0
    except Exception:
        return None


def _fill_actuals(dps: list, econ_events: list[dict]) -> int:
    """给已发布的日历事件补上「实际值」。原地修改 econ_events，返回补上的条数。"""
    by_key = {dp.key: dp for dp in dps}
    today = dt.date.today()
    n = 0
    for ev in econ_events:
        m = ACTUAL_MAP.get(ev.get("title"))
        if not m or ev.get("actual"):
            continue
        try:
            rel = dt.date.fromisoformat(ev["date"])
        except Exception:
            continue
        if rel >= today:                      # 还没发布，没有实际值
            continue
        key, how, fmt = m
        dp = by_key.get(key)
        if not dp or dp.stale:
            continue
        # 该次发布覆盖的数据周期：周频取发布前一周，月频取上一个月1号
        weekly = how == "level_k" or "初请" in ev["title"]
        period = ((rel - dt.timedelta(days=5)).isoformat() if weekly
                  else (rel.replace(day=1) - dt.timedelta(days=1)).replace(day=1).isoformat())
        got = _compute_actual(dp, period, how, fmt)
        if got:
            ev["actual"], ev["actual_as_of"] = got
            ev["actual_src"] = dp.source        # 留痕：实际值来自哪条官方序列
            n += 1
    return n


def _check_late(dps: list, econ_events: list[dict]) -> list[dict]:
    """官方已发布但我们的数还停在旧周期 → 延迟。

    as_of 是"数据周期"不是"发布日"：非农9-04发布的是8月数据(as_of 2026-08-01)，
    所以不能拿 as_of 直接比发布日，要比"这次发布应该覆盖到的周期"。
    """
    by_key = {dp.key: dp for dp in dps}
    today = dt.date.today()
    out = []
    for ev in econ_events:
        keys = RELEASE_WATCH.get(ev.get("title"))
        if not keys or ev.get("estimated"):
            continue
        try:
            rel = dt.date.fromisoformat(ev["date"])
        except Exception:
            continue
        if not (rel < today and (today - rel).days <= 14):   # 只查近两周内已发生的
            continue
        if (today - rel).days < GRACE_DAYS:
            continue
        # 该次发布应覆盖到的最早周期：周频取发布前8天，月/季频取上一个月1号
        weekly = "H.4.1" in ev["title"] or "初请" in ev["title"]
        expect = (rel - dt.timedelta(days=8)) if weekly else \
            (rel.replace(day=1) - dt.timedelta(days=1)).replace(day=1)
        for k in keys:
            dp = by_key.get(k)
            if not dp or not dp.as_of:
                continue
            if dt.date.fromisoformat(dp.as_of) < expect:
                out.append({
                    "key": k, "label": LABELS.get(k, k),
                    "release": ev["title"], "released_on": ev["date"],
                    "days_late": (today - rel).days,
                    "as_of": dp.as_of, "expected_period": expect.isoformat(),
                    "msg": f"{ev['title']} {ev['date']} 已发布{(today - rel).days}天，"
                           f"但「{LABELS.get(k, k)}」还停在 {dp.as_of}",
                })
    # 同一指标只报最新一次
    dedup = {}
    for x in out:
        if x["key"] not in dedup or x["released_on"] > dedup[x["key"]]["released_on"]:
            dedup[x["key"]] = x
    return list(dedup.values())


def _load_gex_history() -> list[dict]:
    """墙位每日轨迹：CBOE免费链只有当天快照，历史从我们2026-08-27自建存档起步，逐日生长。"""
    out = []
    gdir = DATA / "gex"
    if not gdir.exists():
        return out
    for f in sorted(gdir.glob("????-??-??.json")):
        try:
            g = json.loads(f.read_text(encoding="utf-8"))
            out.append({"date": f.stem, "flip": g.get("flip"),
                        "call_wall": g.get("call_wall"), "put_wall": g.get("put_wall"),
                        "net_gex_bn": g.get("net_gex_bn"), "spot": g.get("spot")})
        except Exception:
            continue
    return out[-250:]


def build_latest(dps, rule_results, auctions, cal, scorecard_data,
                 news_items=None, ctx=None) -> dict:
    by_key = {dp.key: dp for dp in dps}
    # 健康统计只算"应该自动更新的源"。可选人工字段没填不是故障，单独归类不报警。
    auto_dps = [dp for dp in dps if not dp.extra.get("optional")]
    optional_dps = [dp for dp in dps if dp.extra.get("optional")]
    stale_list = [{"key": dp.key, "as_of": dp.as_of, "reason": dp.stale_reason,
                   "label": LABELS.get(dp.key, dp.key)}
                  for dp in auto_dps if dp.stale]
    optional_list = [{"key": dp.key, "label": LABELS.get(dp.key, dp.key),
                      "filled": dp.value is not None, "as_of": dp.as_of,
                      "desc": dp.extra.get("desc", "")}
                     for dp in optional_dps]
    metrics = []
    series = {}
    group_of = {k: g for g, keys in GROUPS.items() for k in keys}
    for dp in dps:
        metrics.append({
            "key": dp.key, "label": LABELS.get(dp.key, dp.key), "value": dp.value,
            "unit": dp.unit, "as_of": dp.as_of, "source": dp.source, "tier": dp.tier,
            "stale": dp.stale, "stale_reason": dp.stale_reason,
            "label_en": LABELS_EN.get(dp.key, dp.key),
            "chg_1d": dp.extra.get("chg_1d"), "chg_1d_pct": dp.extra.get("chg_1d_pct"),
            "chg_20d": dp.extra.get("chg_20d"), "chg_bn": dp.extra.get("chg_bn"),
            "pctile_52w": dp.extra.get("pctile_52w"),
            "group": group_of.get(dp.key, "other"),
            "role": ROLE.get(dp.key),
        })
        if dp.extra.get("series"):
            series[dp.key] = dp.extra["series"][-250:]
    # 泰勒缺口合成序列（build_ctx算好，看板画图+口径标注）
    if ctx and ctx.get("_taylor_series"):
        series["taylor_gap"] = ctx["_taylor_series"]

    today = dt.date.today()
    upcoming = [c for c in cal
                if 0 <= (dt.date.fromisoformat(c["date"]) - today).days <= 30]

    # 发布日程对账：官方发了但我们没跟上 → 延迟清单
    _econ = (by_key["econ_calendar"].extra.get("events", [])
             if "econ_calendar" in by_key else [])
    late_list = _check_late(dps, _econ)
    # 日历补「实际值」（来自我们自己抓的官方序列，凑齐 实际/预期/前值 三栏）
    _n_actual = _fill_actuals(dps, _econ)
    if _n_actual:
        print(f"[calendar] 补上实际值 {_n_actual} 条", file=sys.stderr)

    tic_rows = [{"country": by_key[k].extra.get("country", k), "holdings_bn": by_key[k].value,
                 "chg_bn": by_key[k].extra.get("chg_bn"), "as_of": by_key[k].as_of,
                 "stale": by_key[k].stale}
                for k in ("tic_japan", "tic_uk", "tic_china") if k in by_key]

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "health": {"total_sources": len(auto_dps), "ok": len(auto_dps) - len(stale_list),
                   "stale": len(stale_list), "stale_list": stale_list,
                   "optional": optional_list,
                   "late": late_list},
        "metrics": metrics,
        "rules": rule_results,
        "auctions": auctions,
        "tic": tic_rows,
        "calendar": upcoming,
        "series": series,
        "predictions": scorecard_data,
        "news": news_items or [],
        "radar": build_radar(ctx or {}),
        "radar_bands": build_radar_bands(ctx or {}),
        "regime": build_regime(ctx or {}, series),
        "gex_history": _load_gex_history(),
        "gex": (by_key["gex_net"].extra | {"net_gex_bn": by_key["gex_net"].value,
                                           "stale": by_key["gex_net"].stale})
               if "gex_net" in by_key else None,
        "spx_ohlc": by_key["spx"].extra.get("ohlc") if "spx" in by_key else None,
        "knowledge": build_knowledge(ctx or {}),
        # 链条推理实例化（机械填槽，不生成新主张——见 core/reason.py 头注）
        "reasoning": None,          # 下面填（需要 knowledge 已构建）
        "econ_calendar": (by_key["econ_calendar"].extra.get("events", [])
                          if "econ_calendar" in by_key and not by_key["econ_calendar"].stale else []),
        # 日历三层里 ForexFactory 层的健康度（ok / fallback_cache(日期) / unavailable(原因)）
        "econ_calendar_status": (by_key["econ_calendar"].extra.get("ff_status")
                                 if "econ_calendar" in by_key else None),
    }


# 盘中高频刷新的行情项（只这些会变，宏观月频/周频数据不需要高频拉）
# btc 特别说明：国内门户2021年加密禁令后全下架行情，境外交易所被墙，
# 浏览器端在国内取不到。故走本通道——穿墙在 Actions(美国服务器)完成，
# 数据落到自有域名，国内外都能看到（代价：20分钟粒度而非实时）。
QUOTE_TICKERS = {
    "spx": "^GSPC", "vix": "^VIX", "gold": "GC=F", "silver": "SI=F",
    "dxy": "DX-Y.NYB", "usdjpy": "JPY=X", "brent": "BZ=F", "move": "^MOVE",
    "btc": "BTC-USD", "es": "ES=F", "nq": "NQ=F",
}


def run_quotes_only() -> None:
    """轻量模式：只抓行情最新价 → data/quotes.json。

    为什么单独一条通道：完整流水线要跑51个源+规则引擎+推送，几分钟一次不现实；
    而盘中真正在变的只有行情价。拆开后可以每20分钟刷一次价，
    重活仍旧每天两次。前端优先读 quotes.json，比 latest.json 新才覆盖。
    """
    import yfinance as yf
    DATA.mkdir(exist_ok=True)
    out, failed = {}, []
    for key, sym in QUOTE_TICKERS.items():
        try:
            h = yf.Ticker(sym).history(period="5d", auto_adjust=False)
            closes = h["Close"].dropna()
            if closes.empty:
                failed.append(key)
                continue
            v = round(float(closes.iloc[-1]), 4)
            prev = float(closes.iloc[-2]) if len(closes) > 1 else None
            out[key] = {
                "value": v,
                "as_of": closes.index[-1].date().isoformat(),
                "chg_1d_pct": round((v / prev - 1) * 100, 3) if prev else None,
                "source": f"yfinance:{sym}",
            }
        except Exception as e:
            failed.append(f"{key}({type(e).__name__})")
    payload = {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "quotes": out,
        "failed": failed,
        "note": "盘中轻量刷新；行情源本身约15分钟延迟，非逐笔实时",
    }
    (DATA / "quotes.json").write_text(json.dumps(payload, ensure_ascii=False),
                                      encoding="utf-8")
    spx = out.get("spx", {}).get("value")
    (DATA / "_commit_msg.txt").write_text(
        f"quotes {dt.datetime.now(dt.timezone.utc):%m-%d %H:%M}Z"
        + (f" | SPX {spx:.0f}" if spx else "")
        + (f" | 失败 {len(failed)}" if failed else ""),
        encoding="utf-8")
    print(f"[quotes] {len(out)}/{len(QUOTE_TICKERS)} ok"
          + (f", failed: {failed}" if failed else ""), file=sys.stderr)


def main():
    # Windows 控制台默认GBK，统一UTF-8
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-fetch", action="store_true")
    ap.add_argument("--quotes-only", action="store_true",
                    help="轻量模式：只刷行情价写 data/quotes.json，不跑规则/不推TG。盘中高频用")
    args = ap.parse_args()

    load_env()
    if args.quotes_only:
        run_quotes_only()
        return
    sources = yaml.safe_load((ROOT / "config" / "sources.yaml").read_text(encoding="utf-8"))["sources"]
    rules = yaml.safe_load((ROOT / "config" / "rules.yaml").read_text(encoding="utf-8"))

    DATA.mkdir(exist_ok=True)
    (DATA / "snapshots").mkdir(exist_ok=True)
    today = dt.date.today().isoformat()
    snap_file = DATA / "snapshots" / f"{today}.json"

    if args.no_fetch and snap_file.exists():
        raw = json.loads(snap_file.read_text(encoding="utf-8"))
        dps = [DataPoint(**d) for d in raw]
    else:
        dps = fetch_everything(sources)
        snap_file.write_text(json.dumps([dp.to_dict() for dp in dps], ensure_ascii=False),
                             encoding="utf-8")

    ctx, stale_keys, auctions = build_ctx(dps)

    state = json.loads(STATE_FILE.read_text(encoding="utf-8")) if STATE_FILE.exists() else {}
    rule_results = engine.evaluate(rules, ctx, stale_keys, state)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=False, indent=1), encoding="utf-8")

    scorecard_data = predict.scorecard(ROOT / "predictions")
    # 三源概率对照 + ZQ自算时间序列（预测页呈现）
    by_key_pre = {dp.key: dp for dp in dps}
    def _v(k):
        d = by_key_pre.get(k)
        return {"value": d.value, "as_of": d.as_of, "stale": d.stale} if d else None
    odds_series = []
    fw_dir = DATA / "fedwatch"
    if fw_dir.exists():
        for pth in sorted(fw_dir.glob("*.json")):
            try:
                j = json.loads(pth.read_text(encoding="utf-8"))
                odds_series.append([j["date"], j["p_hike_sep"]])
            except Exception:
                pass
    scorecard_data["market_odds"] = {
        "zq_auto": _v("fedwatch_zq_sep"),
        "cme_manual": _v("fedwatch_sep_hike"),
        "polymarket": _v("polymarket_sep_hike"),
        "series_zq": odds_series[-120:],
    }
    cal = rules.get("calendar", [])
    try:
        news_items = news.fetch_news(DATA / "news.json")
    except Exception as e:
        print(f"[warn] news: {e}", file=sys.stderr)
        news_items = []
    # 金十快讯：讲话日程 + 已发生讲话的原话（言论不是读数，不进任何节点判定）。
    # 2026-09-02：Barr 讲话「若通胀未降温应果断加息」，RSS 流 0 条、日历 0 条，
    # 系统整个瞎的。讲话只在金十每天 06:50 的【今日重点关注】里，从那抽。
    speech_events: list[dict] = []
    try:
        jf = jin10_flash.fetch(DATA / "jin10_flash.json")
        speech_events = jf.get("events", [])
        have = {n.get("link") or n.get("title") for n in news_items}
        for s in jf.get("speeches", []):
            k = s.get("link") or s.get("title")
            if k not in have:
                news_items.append(s)
                have.add(k)
        news_items.sort(key=lambda x: x.get("published") or "", reverse=True)
        if jf.get("error"):
            print(f"[warn] jin10_flash: {jf['error']}", file=sys.stderr)
    except Exception as e:
        print(f"[warn] jin10_flash: {e}", file=sys.stderr)
    latest = build_latest(dps, rule_results, auctions, cal, scorecard_data,
                          news_items=news_items, ctx=ctx)
    latest["speech_events"] = speech_events
    # 3日内三星事件 → 快报观测口（新日历用 importance:1-3，非旧的 impact 字符串）
    _today = dt.date.today()
    latest["knowledge"]["_econ_events"] = [
        f"{e['date'][5:]} {e['title']}"
        for e in latest.get("econ_calendar", [])
        if e.get("importance", 0) >= 3 and e.get("date")
        and 0 <= (dt.date.fromisoformat(e["date"]) - _today).days <= 3][:3]
    # 链条推理：沿已写死的因果路径填入当前读数（对比上次以标出翻转）
    _rs_file = DATA / "reason_state.json"
    _prev = json.loads(_rs_file.read_text(encoding="utf-8")) if _rs_file.exists() else {}
    latest["reasoning"] = reason.build_reasoning(latest["knowledge"], _prev)
    _rs_file.write_text(json.dumps(
        {"chain_nodes": latest["reasoning"].pop("_node_snapshot")},
        ensure_ascii=False), encoding="utf-8")

    latest["digest"] = build_digest(ctx, latest["knowledge"], rule_results,
                                    latest["radar"], cal)
    LATEST_FILE.write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")

    metrics_by_key = {m["key"]: m for m in latest["metrics"]}
    cal_today = [c for c in cal if c["date"] == today]
    # 今明两天的经济日历事件（★★+），并入推送日程段
    _tm = (dt.date.today() + dt.timedelta(days=1)).isoformat()
    econ_today = [e for e in latest.get("econ_calendar", [])
                  if e.get("date") in (today, _tm) and e.get("importance", 0) >= 2]
    # 讲话：今明两天的日程 + 最近30小时内已抓到原话的（带 tone 的就是金十快讯讲话条）
    sp_events_today = [s for s in speech_events if s.get("date") in (today, _tm)]
    _cut = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    speeches_recent = [n for n in news_items if n.get("tone") and (n.get("published") or "") >= _cut]
    msg = notify.build_message(latest["health"], rule_results, auctions, cal_today,
                               metrics_by_key, today,
                               digest=latest["digest"], radar=latest["radar"],
                               econ_today=econ_today,
                               speech_events=sp_events_today, speeches=speeches_recent)
    notify.send(msg, dry=args.dry_run)

    # 提交留痕：让 GitHub 历史一眼看出这次跑动了什么，而不是清一色 "data: 时间戳"
    _f = [r for r in rule_results if r["status"] == "fired"]
    h = latest["health"]
    def _mv(k, name, fmt="{:.0f}"):
        m = metrics_by_key.get(k)
        if not m or m.get("value") is None:
            return None
        c = m.get("chg_1d_pct")
        return f"{name}{fmt.format(m['value'])}" + (
            f"({'+' if c > 0 else ''}{c:.1f}%)" if c is not None else "")
    bits = [x for x in (_mv("spx", "SPX"), _mv("gold", "金"),
                        _mv("us30y", "30Y", "{:.2f}")) if x]
    parts = [f"{h['ok']}/{h['total_sources']}源"]
    if _f:
        parts.append("触发:" + "/".join(r["name"].split("（")[0] for r in _f[:2]))
    if h.get("late"):
        parts.append(f"延迟{len(h['late'])}项")
    if h.get("stale_list"):
        parts.append(f"停更{len(h['stale_list'])}项")
    parts.append(f"日历{len(latest.get('econ_calendar', []))}条")
    if bits:
        parts.append(" ".join(bits))
    (DATA / "_commit_msg.txt").write_text(
        f"data {dt.datetime.now(dt.timezone.utc):%m-%d %H:%M}Z | " + " | ".join(parts),
        encoding="utf-8")

    fired = [r for r in rule_results if r["status"] == "fired"]
    print(f"\n[summary] sources={latest['health']['ok']}/{latest['health']['total_sources']} ok, "
          f"fired={len(fired)}, skipped={sum(1 for r in rule_results if r['status']=='skipped')}, "
          f"latest.json={LATEST_FILE.stat().st_size//1024}KB", file=sys.stderr)


if __name__ == "__main__":
    main()
