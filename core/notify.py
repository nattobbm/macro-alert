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
                  econ_today: list[dict] | None = None,
                  speech_events: list[dict] | None = None,
                  speeches: list[dict] | None = None) -> str:
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
    # 官员讲话/会议（金十【今日重点关注】抽的）。9-1 Barr 喊加息我们连日程都没有——
    # 讲话不在结构化日历里，只在这条快讯里。今明两天的都列，讲话人标出来
    for s in (speech_events or [])[:6]:
        t = f"{s['time_bj']} " if s.get("time_bj") else ""
        # 标题里已经有人名（"加拿大央行行长麦克勒姆召开…"）就别再括号重复一遍
        who = f"（{s['speaker']}）" if s.get("speaker") and s["speaker"] not in s["title"] else ""
        sched.append(f"• {t}{s['title']}{who}")
    if sched:
        L.append("*今明日程*")
        L += sched
        L.append("")

    # ── 4b. 官员在说什么（已发生的讲话，鹰鸽只是关键词计数，不是解读）──
    # 言论不是读数：不进任何节点判定，只让人知道"谁说了什么、偏哪边"。
    if speeches:
        by_who: dict[str, dict] = {}
        for sp in speeches:
            w = sp.get("speaker") or "?"
            d = by_who.setdefault(w, {"hawk": 0, "dove": 0, "n": 0, "top": None})
            tone = sp.get("tone") or {}
            d["hawk"] += tone.get("hawk", 0)
            d["dove"] += tone.get("dove", 0)
            d["n"] += 1
            # 留一句当代表句：先比鹰鸽分的绝对值，同分取最短——
            # 短的是原话（「如果通胀不能很快放缓，那么将是时候加息了」），
            # 长的是【…】整理稿，截到90字正好断在半句
            score = tone.get("hawk", 0) - tone.get("dove", 0)
            title = sp.get("title", "")
            is_article = title.startswith("【")
            cand = (abs(score), not is_article, -len(title))
            if d["top"] is None or cand > d["top"][2]:
                d["top"] = (score, title, cand)
        L.append("*官员在说什么*")
        for w, d in by_who.items():
            lean = "偏鹰" if d["hawk"] > d["dove"] else "偏鸽" if d["dove"] > d["hawk"] else "中性"
            L.append(f"• {w}　{d['n']}条 · {lean}（鹰{d['hawk']}/鸽{d['dove']}）")
            if d["top"] and d["top"][1]:
                L.append(f"  _{_esc(d['top'][1][:90])}_")
        L.append("  ‖ 只是关键词计数。节点判定仍只认市场定价，不认讲话。")
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
    """推送。

    安全：bot token 出现在请求URL里，requests 的异常文本会带上完整URL。
    本仓库是公开仓库，GitHub Actions 日志对所有人可见——网络抖动一次就会把
    token 印到公开日志里。因此所有异常与响应文本一律过 redact() 再输出。
    （同源事故：2026-08-27 FRED密钥经 stale_reason 泄露进公开仓库）
    """
    from fetchers.base import redact

    token, chat = os.getenv("TG_BOT_TOKEN"), os.getenv("TG_CHAT_ID")
    if dry or not token or not chat:
        print(text)
        if not dry:
            print("[warn] 缺少 TG_BOT_TOKEN / TG_CHAT_ID，未推送", file=sys.stderr)
        return False
    url = f"https://api.telegram.org/bot{token}/sendMessage"
    ok = True
    for i in range(0, len(text), 3900):
        chunk = text[i:i + 3900]
        try:
            r = requests.post(url, timeout=30, json={
                "chat_id": chat, "text": chunk,
                "parse_mode": "Markdown", "disable_web_page_preview": True})
            if not r.ok:
                # Markdown 解析失败时降级纯文本重试
                r = requests.post(url, timeout=30,
                                  json={"chat_id": chat, "text": chunk})
            if not r.ok:
                print(f"[error] tg: {redact(r.text)[:200]}", file=sys.stderr)
                ok = False
        except Exception as e:
            # 异常文本含请求URL(带token)，必须脱敏后再进日志
            print(f"[error] tg: {redact(f'{type(e).__name__}: {e}')[:200]}",
                  file=sys.stderr)
            ok = False
    return ok
