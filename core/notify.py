"""Telegram 推送。

2026-08-31 重构（Momo："理清楚因果链、数据、什么意思，删除多余的，重要事情重要标记"）：
旧版问题——①"今日推理"和"触发规则"重复播报同一件事 ②裸数字代码块没有含义
③数据健康被3个可选人工字段刷屏，真问题反而看不见 ④拍卖行 tail— 之类空值噪音。

新结构（重要度从上到下）：
  ■ 今天最重要 → 出了什么事 + 这意味着什么 + 什么情况算判错
  ◇ 快要触发   → 离警戒线最近的几条
  · 今明日程   → 官方发布节点
  数据         → 带涨跌方向，不是裸数字
  体检         → 只在自动源真出问题时才出现（可选人工字段不刷屏）
"""
from __future__ import annotations

import os
import sys

import requests

SEVERITY_ICON = {"info": "·", "watch": "◇", "alert": "▲", "critical": "■"}
SEVERITY_RANK = {"info": 0, "watch": 1, "alert": 2, "critical": 3}


def _esc(s: str) -> str:
    """Markdown 保守转义：只处理会破坏解析的下划线（key 名里常见）。"""
    return str(s).replace("_", "\\_")


def build_message(health: dict, rule_results: list[dict], auctions: list[dict],
                  cal_today: list[dict], metrics: dict, date_str: str,
                  digest: dict | None = None, radar: list[dict] | None = None,
                  econ_today: list[dict] | None = None) -> str:
    L: list[str] = []
    fired = [r for r in rule_results if r["status"] == "fired"]
    fired.sort(key=lambda r: SEVERITY_RANK.get(r["severity"], 0), reverse=True)

    # ── 1. 今天最重要的事（因果链：出了什么事→什么意思→怎么算我错）──
    L.append(f"*宏观监控 {date_str}*")
    L.append("")
    if fired:
        top = fired[0]
        L.append(f"{SEVERITY_ICON[top['severity']]} *今天最重要*")
        L.append(f"*{top['name']}*")
        ins = "，".join(f"{_esc(k)}={v}" for k, v in list(top["inputs"].items())[:3])
        if ins:
            L.append(f"读数：`{ins}`")
        if top.get("chain"):
            L.append(f"什么意思：{top['chain']}")
        if top.get("falsify"):
            L.append(f"什么情况算判错：{top['falsify']}")
        L.append("")
        # 其余触发项压缩成一行一条，不重复讲链条
        if len(fired) > 1:
            L.append("*另外触发*")
            for h in fired[1:]:
                ins = "，".join(f"{_esc(k)}={v}" for k, v in list(h["inputs"].items())[:2])
                L.append(f"{SEVERITY_ICON[h['severity']]} {h['name']}"
                         + (f"　`{ins}`" if ins else ""))
            L.append("")
    else:
        L.append("· *今天没有规则触发*")
        L.append("")

    # ── 2. 状态变化（digest 里非"规则触发"的部分，避免与上面重复）──
    if digest and digest.get("lines"):
        changes = [d for d in digest["lines"]
                   if not d["text"].startswith("规则触发")
                   and d["text"] != "与上次运行相比无状态变化"]
        if changes:
            L.append("*和上次相比的变化*")
            for d in changes[:6]:
                L.append(f"{d['icon']} {d['text']}")
            L.append("")

    # ── 3. 快要触发的（离警戒线最近，尚未越线）──
    near = [r for r in (radar or []) if 0 < r["distance_pct"] <= 5][:4]
    if near:
        L.append("*快到线了*")
        for r in near:
            L.append(f"◇ {r['label']}　还差{abs(r['distance_pct']):.1f}%"
                     f"（现{r['value']:g} / 线{r['threshold']:g}）")
        L.append("")

    # ── 4. 今明官方日程 ──
    sched = []
    for c in cal_today or []:
        sched.append(f"• {c['event']}" + (f"\n  _{c['watch']}_" if c.get("watch") else ""))
    for e in (econ_today or [])[:5]:
        stars = "★" * e.get("importance", 1)
        fc = f"　预期{e['forecast']}" if e.get("forecast") else ""
        prev = f" 前值{e['previous']}" if e.get("previous") else ""
        sched.append(f"• {stars} {e['title']}{fc}{prev}")
    if sched:
        L.append("*今明日程*")
        L += sched
        L.append("")

    # ── 5. 数据：带方向，不是裸数字 ──
    def row(k: str, name: str, fmt: str = "{:.2f}") -> str | None:
        m = metrics.get(k)
        if not m or m.get("value") is None:
            return None
        v = fmt.format(m["value"])
        chg = m.get("chg_1d_pct")
        if chg is None:
            return f"{name} {v}"
        arrow = "↑" if chg > 0 else ("↓" if chg < 0 else "→")
        return f"{name} {v} {arrow}{abs(chg):.1f}%"
    picks = [row("spx", "美股", "{:.0f}"), row("vix", "恐慌"), row("gold", "黄金", "{:.0f}"),
             row("us30y", "30年利率"), row("tips10y", "真利率"), row("usdjpy", "日元", "{:.1f}"),
             row("brent", "油价"), row("dxy", "美元")]
    picks = [p for p in picks if p]
    if picks:
        L.append("*数据*")
        for i in range(0, len(picks), 2):
            L.append("　".join(picks[i:i + 2]))
        L.append("")

    # ── 6. 最近拍卖：只报有内容的字段，不打印 tail— ──
    if auctions:
        L.append("*最近拍卖*")
        for a in auctions[:3]:
            tail = a.get("tail_bp")
            syn = a.get("tail_bp_synthetic")
            tail_s = (f"　tail {tail}bp" if tail is not None
                      else (f"　tail~{syn}bp(合成)" if syn is not None else ""))
            L.append(f"• {a['term']} 认购{a['bid_to_cover']}"
                     f"　海外{a['indirect_pct']}%{tail_s}")
        L.append("")

    # ── 7. 数据体检：只在自动源真出问题时出现 ──
    problems = []
    for s in health.get("stale_list", []):
        problems.append(f"　停更：{s.get('label') or _esc(s['key'])}"
                        f"（{_esc(str(s.get('as_of')))}，{_esc(s['reason'][:40])}）")
    for x in health.get("late", []):
        problems.append(f"　延迟：{x['msg']}")
    if problems:
        L.append(f"⚠️ *数据体检* {health['ok']}/{health['total_sources']} 自动源正常")
        L += problems
        L.append("")
    else:
        L.append(f"✅ 数据体检：{health['ok']}/{health['total_sources']} 自动源全部正常")

    return "\n".join(L).rstrip()


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
