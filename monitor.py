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

from fetchers import fred, fiscaldata, tic, treasurydirect, cftc, nyfed, eia, market, manual, news, cboe_gex, fedwatch_zq, polymarket  # noqa: E402
from fetchers.base import DataPoint  # noqa: E402
from core import engine, notify, predict  # noqa: E402

DATA = ROOT / "data"
STATE_FILE = DATA / "state.json"
LATEST_FILE = DATA / "latest.json"

LABELS = {
    "tips10y": "真利率(扣通胀)", "us10y": "10年国债利率", "us30y": "30年国债利率",
    "us20y": "20年国债利率", "curve_10y2y": "利率曲线(10Y-2Y)", "breakeven10": "物价预期(债市定价)",
    "sofr": "隔夜借钱利率SOFR", "iorb": "准备金利率IORB", "rrp": "隔夜逆回购RRP(备用资金)", "fed_assets": "美联储总资产",
    "tga": "财政部账户TGA(周)", "m2": "货币供应量M2", "debt_total": "联邦债务总额", "tga_daily": "财政部账户TGA(日)",
    "avg_rate": "政府借钱平均利息", "tic_japan": "日本持有美债", "tic_uk": "英国持有美债",
    "tic_china": "中国持有美债", "cot_gold": "黄金大户净多单", "cot_silver": "白银大户净多单",
    "cot_jpy": "日元大户净多单", "repo_ops": "常备回购SRF用量", "sofr_nyfed": "SOFR(纽约联储版)",
    "crude_stocks": "原油库存", "spx": "美股大盘SPX", "vix": "恐慌指数VIX", "vix3m": "3月期VIX",
    "gold": "黄金", "silver": "白银", "platinum": "铂金", "dxy": "美元指数",
    "usdjpy": "美元兑日元", "brent": "油价Brent", "wti": "油价WTI", "move": "债市恐慌指数MOVE",
    "auctions": "国债拍卖认购", "gex_net": "做市商GEX", "fedwatch_zq_sep": "9月加息概率(期货算)", "polymarket_sep_hike": "9月加息概率(押注市场)", "fedwatch_sep_hike": "9月加息概率(手动)",
    "fima_weekly_usd": "外国央行借美元(手动)", "war_risk_premium": "战争险费率(手动)",
    "auction_tail_bp": "拍卖尾差(手动)",
}
GROUPS = {
    "rates": ["tips10y", "us10y", "us30y", "us20y", "curve_10y2y", "breakeven10"],
    "liquidity": ["sofr", "sofr_nyfed", "iorb", "rrp", "fed_assets", "tga", "tga_daily", "m2", "repo_ops"],
    "fiscal": ["debt_total", "avg_rate"],
    "tic": ["tic_japan", "tic_uk", "tic_china"],
    "positioning": ["cot_gold", "cot_silver", "cot_jpy"],
    "market": ["spx", "vix", "vix3m", "gold", "silver", "platinum", "dxy", "usdjpy", "brent", "wti", "move"],
    "manual": ["fedwatch_sep_hike", "fima_weekly_usd", "war_risk_premium", "auction_tail_bp"],
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
    dps += manual.fetch_all(DATA / "manual.json")
    dps.append(cboe_gex.fetch(DATA / "gex"))
    dps.append(fedwatch_zq.fetch(DATA / "fedwatch"))
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

    # GEX 衍生变量（雷达用）：距flip/墙的百分比距离
    gex_dp = by_key.get("gex_net")
    if gex_dp and not gex_dp.stale:
        spot = gex_dp.extra.get("spot")
        for name, level in [("flip", gex_dp.extra.get("flip")),
                            ("callwall", gex_dp.extra.get("call_wall")),
                            ("putwall", gex_dp.extra.get("put_wall"))]:
            if spot and level:
                ctx[f"gex_{name}_dist_pct"] = round((spot - level) / spot * 100, 3)

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
    ("黄金冲上界",          "gold",             4700.0, "above", "X1_gold_breakout"),
    ("黄金跌下界",          "gold",             4450.0, "below", "X1_gold_breakout"),
    ("油价出上界",      "brent",            90.0, "above", "G1_oil_band_break"),
    ("油价出下界",      "brent",            80.0, "below", "G1_oil_band_break"),
    ("恐慌指数进应激区",         "vix",              30.0, "above", "S1_vix_regime"),
    ("债市恐慌指数爆表",          "move",             140.0, "above", "T4_move"),
    ("黄金大户仓位极端",       "cot_gold_pctile",  90.0, "above", "P1_cot_extreme"),
    ("利息增速追上收入增速",            "avg_rate",         4.0, "above", "T6_rg_gap"),
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
        out.append({"label": label, "key": key, "value": v, "threshold": thr,
                    "direction": direction, "rule_id": rule_id,
                    "distance_pct": round(dist * 100, 2)})
    out.sort(key=lambda x: x["distance_pct"])
    return out


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
                node = {"label": nd["label"], "note": nd.get("note", ""), "term": nd.get("term", "")}
                if "metric" in nd:
                    v = ctx.get(nd["metric"])
                    thr, direc = nd["threshold"], nd["direction"]
                    if v is None:
                        node.update(status="no_data", value=None)
                    else:
                        denom = abs(thr) or 100.0
                        dist = (thr - v) / denom if direc == "above" else (v - thr) / denom
                        st = "crossed" if dist <= 0 else ("near" if dist < 0.05 else "quiet")
                        crossed += st == "crossed"; near += st == "near"
                        node.update(status=st, value=v, threshold=thr,
                                    direction=direc, dist_pct=round(dist * 100, 2))
                else:
                    node.update(status=nd.get("status", "fact"),
                                value_text=nd.get("value_text", ""))
                nodes.append(node)
            out["chains"].append({
                "id": ch["id"], "name": ch["name"], "emoji": ch.get("emoji", ""), "term": ch.get("term", ""), "one_liner": ch.get("one_liner", ""),
                "falsify": ch.get("falsify", ""), "nodes": nodes,
                "heat": crossed * 2 + near,   # 排序用：越热越靠前
            })
        out["chains"].sort(key=lambda c: -c["heat"])

    conf = kdir / "conclusions.yaml"
    if conf.exists():
        cons = yaml.safe_load(conf.read_text(encoding="utf-8")).get("conclusions", [])
        for c in cons:
            if c.get("date") is not None:
                c["date"] = str(c["date"])
        cons.sort(key=lambda c: c.get("date", ""), reverse=True)
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


def build_regime(ctx: dict) -> dict:
    """主导链判定（8-25报告链条6判据的条件计数版，不做叙事）。"""
    conds = [
        ("加息预期<0.4", ctx.get("fedwatch_sep_hike"), lambda v: v < 0.4),
        ("30Y>5.2",      ctx.get("us30y"),             lambda v: v > 5.2),
        ("盈亏平衡通胀>2.8", ctx.get("breakeven10"),   lambda v: v > 2.8),
    ]
    detail = [{"cond": name, "value": v, "met": (v is not None and fn(v))}
              for name, v, fn in conds]
    met = sum(1 for d in detail if d["met"])
    return {"name": "通胀偏高但不加息(金融抑制)", "met": met, "total": len(detail), "detail": detail,
            "judge": "判据(8-25报告)：若实际利率跳升而金不跌→确认主导；若金随实际利率同步回落→回到需求侧紧缩链"}


def build_latest(dps, rule_results, auctions, cal, scorecard_data,
                 news_items=None, ctx=None) -> dict:
    by_key = {dp.key: dp for dp in dps}
    stale_list = [{"key": dp.key, "as_of": dp.as_of, "reason": dp.stale_reason}
                  for dp in dps if dp.stale]
    metrics = []
    series = {}
    group_of = {k: g for g, keys in GROUPS.items() for k in keys}
    for dp in dps:
        metrics.append({
            "key": dp.key, "label": LABELS.get(dp.key, dp.key), "value": dp.value,
            "unit": dp.unit, "as_of": dp.as_of, "source": dp.source, "tier": dp.tier,
            "stale": dp.stale, "stale_reason": dp.stale_reason,
            "chg_1d": dp.extra.get("chg_1d"), "chg_1d_pct": dp.extra.get("chg_1d_pct"),
            "chg_20d": dp.extra.get("chg_20d"), "chg_bn": dp.extra.get("chg_bn"),
            "pctile_52w": dp.extra.get("pctile_52w"),
            "group": group_of.get(dp.key, "other"),
        })
        if dp.extra.get("series"):
            series[dp.key] = dp.extra["series"][-250:]

    today = dt.date.today()
    upcoming = [c for c in cal
                if 0 <= (dt.date.fromisoformat(c["date"]) - today).days <= 30]

    tic_rows = [{"country": by_key[k].extra.get("country", k), "holdings_bn": by_key[k].value,
                 "chg_bn": by_key[k].extra.get("chg_bn"), "as_of": by_key[k].as_of,
                 "stale": by_key[k].stale}
                for k in ("tic_japan", "tic_uk", "tic_china") if k in by_key]

    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "health": {"total_sources": len(dps), "ok": len(dps) - len(stale_list),
                   "stale": len(stale_list), "stale_list": stale_list},
        "metrics": metrics,
        "rules": rule_results,
        "auctions": auctions,
        "tic": tic_rows,
        "calendar": upcoming,
        "series": series,
        "predictions": scorecard_data,
        "news": news_items or [],
        "radar": build_radar(ctx or {}),
        "regime": build_regime(ctx or {}),
        "gex": (by_key["gex_net"].extra | {"net_gex_bn": by_key["gex_net"].value,
                                           "stale": by_key["gex_net"].stale})
               if "gex_net" in by_key else None,
        "spx_ohlc": by_key["spx"].extra.get("ohlc") if "spx" in by_key else None,
        "knowledge": build_knowledge(ctx or {}),
    }


def main():
    # Windows 控制台默认GBK，统一UTF-8
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-fetch", action="store_true")
    args = ap.parse_args()

    load_env()
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
    latest = build_latest(dps, rule_results, auctions, cal, scorecard_data,
                          news_items=news_items, ctx=ctx)
    LATEST_FILE.write_text(json.dumps(latest, ensure_ascii=False), encoding="utf-8")

    metrics_by_key = {m["key"]: m for m in latest["metrics"]}
    cal_today = [c for c in cal if c["date"] == today]
    msg = notify.build_message(latest["health"], rule_results, auctions, cal_today,
                               metrics_by_key, today)
    notify.send(msg, dry=args.dry_run)

    fired = [r for r in rule_results if r["status"] == "fired"]
    print(f"\n[summary] sources={latest['health']['ok']}/{latest['health']['total_sources']} ok, "
          f"fired={len(fired)}, skipped={sum(1 for r in rule_results if r['status']=='skipped')}, "
          f"latest.json={LATEST_FILE.stat().st_size//1024}KB", file=sys.stderr)


if __name__ == "__main__":
    main()
