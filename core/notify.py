"""Telegram 推送。数据健康区块置顶（踩坑教训的制度化）。"""
from __future__ import annotations

import os
import sys

import requests

SEVERITY_ICON = {"info": "·", "watch": "◇", "alert": "▲", "critical": "■"}


def build_message(health: dict, rule_results: list[dict], auctions: list[dict],
                  cal_today: list[dict], metrics: dict, date_str: str) -> str:
    L = [f"*宏观监控 {date_str}*", ""]

    # 1. 数据健康（最显眼）
    icon = "✅" if health["stale"] == 0 else "⚠️"
    L.append(f"{icon} *数据健康* {health['ok']}/{health['total_sources']} ok")
    for s in health["stale_list"]:
        L.append(f"  stale: `{s['key']}` as\\_of={s.get('as_of')} ({s['reason'][:48]})")
    L.append("")

    # 2. 快照（值+as_of）
    def g(k, fmt="{:.2f}"):
        m = metrics.get(k)
        return fmt.format(m["value"]) if m and m.get("value") is not None else "—"
    L += ["```",
          f"SPX {g('spx','{:.0f}')}  VIX {g('vix')}  MOVE {g('move','{:.0f}')}",
          f"GOLD {g('gold','{:.0f}')}  DXY {g('dxy')}  JPY {g('usdjpy','{:.1f}')}",
          f"Brent {g('brent')}  10Y {g('us10y')}  30Y {g('us30y')}",
          f"TIPS10 {g('tips10y')}  avg_rate {g('avg_rate','{:.3f}')}",
          "```", ""]

    if cal_today:
        L.append("*今日节点*")
        for c in cal_today:
            L.append(f"• {c['event']}")
            if c.get("watch"):
                L.append(f"  _{c['watch']}_")
        L.append("")

    if auctions:
        L.append("*最近拍卖*")
        for a in auctions[:3]:
            tail = a.get("tail_bp")
            tail_s = (f"tail {tail}bp" if tail is not None
                      else (f"tail~{a['tail_bp_synthetic']}bp(合成)"
                            if a.get("tail_bp_synthetic") is not None else "tail—"))
            L.append(f"• {a['term']} {a['auction_date']} 认购{a['bid_to_cover']} "
                     f"indirect {a['indirect_pct']}% {tail_s}")
        L.append("")

    fired = [r for r in rule_results if r["status"] == "fired"]
    if fired:
        L.append("*触发规则*")
        for h in sorted(fired, key=lambda x: ["info", "watch", "alert", "critical"]
                        .index(x["severity"]), reverse=True):
            L.append(f"{SEVERITY_ICON[h['severity']]} *{h['name']}*")
            ins = ", ".join(f"{k}={v}" for k, v in list(h["inputs"].items())[:4])
            if ins:
                L.append(f"  `{ins}`")
            L.append(f"  链条：{h['chain']}")
            if h.get("falsify"):
                L.append(f"  证伪：{h['falsify']}")
        L.append("")
    else:
        L.append("_无规则触发_")

    skipped = [r for r in rule_results if r["status"] == "skipped"]
    if skipped:
        L.append(f"_跳过{len(skipped)}条（依赖stale/缺失）：" +
                 ", ".join(r["id"] for r in skipped[:8]) + "_")
    return "\n".join(L)


def send(text: str, dry: bool = False) -> bool:
    token, chat = os.getenv("TG_BOT_TOKEN"), os.getenv("TG_CHAT_ID")
    if dry or not token or not chat:
        print(text)
        if not dry:
            print("[warn] 缺少 TG_BOT_TOKEN / TG_CHAT_ID，未推送", file=sys.stderr)
        return False
    ok = True
    for i in range(0, len(text), 3900):
        r = requests.post(
            f"https://api.telegram.org/bot{token}/sendMessage",
            json={"chat_id": chat, "text": text[i:i + 3900],
                  "parse_mode": "Markdown", "disable_web_page_preview": True},
            timeout=30)
        if not r.ok:
            # Markdown 解析失败时降级纯文本重试
            r = requests.post(
                f"https://api.telegram.org/bot{token}/sendMessage",
                json={"chat_id": chat, "text": text[i:i + 3900]}, timeout=30)
        if not r.ok:
            print(f"[error] tg: {r.text[:200]}", file=sys.stderr)
            ok = False
    return ok
