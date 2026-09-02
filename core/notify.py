"""Telegram 推送 · 2026-09-02 第二次重构。

规格：`../2026-09-02_TG推送重构计划.md`（Momo 逐条审过）。三句话概括她的框架：
  · **只报变化，不报状态**——上次推送里也成立的东西不是新闻，它们在网站上
  · **主题先出，细节折叠**——主线一屏，拍卖/体检进 spoiler
  · **帮人解读，不提供数学**——数字带点数差和高低差；每个价带口径代号；每句官员原话配"意思："

结构（上到下 = 重要度）：
  【日期】一句话结论（唯一粗体）
  现在 · 美股 SPX … 黄金 XAUUSD … / GC …（发出那一刻的价，20 分钟通道）
  ■ 今天变了什么      ← 新越线 / 新回线 / 判据翻 / 带子破，最多 5 条
  ■ Momo 8-31 签的 9-16 议息判断   ← 只在有新证据时出现
  ■ 再动一点就会触发的  ← 最多 3 条，"再往哪边动多少到哪个价，然后会怎样"
  ■ 今明要盯          ← 决议/讲话/★★★，带北京时间
  ■ 官员原话 · 意思    ← 一人一句 + 词典翻译
  ||折叠：拍卖（只在越线时）· 体检（只在坏时）||

不许出现：变量名、错误码、内部框架名（艾丽/官僚信誉）、S1/S2/S3、"快到线""预测单""阈值"。
词库：`site/WORDING.md`。
"""
from __future__ import annotations

import datetime as dt
import os
import re
import sys

import requests

# ── MarkdownV2 转义：18 个保留字符全部转，只在最后加粗/斜体/spoiler 时才裸用 ──
_MD2 = r"_*[]()~`>#+-=|{}.!\\"


def esc(s) -> str:
    return re.sub(r"([%s])" % re.escape(_MD2), r"\\\1", str(s))


def bold(s) -> str:
    return f"*{esc(s)}*"


def spoiler(s) -> str:
    return f"||{esc(s)}||"


# ── 口径代号：代号就是口径，写了就不用再解释"口径"这个词 ──────────────
# (显示名, 代号, 取价 key 的优先顺序[quotes.json 优先], 小数位, 后缀)
PRICE_LINE = [
    ("美股", "SPX",    ["spx"],              0, ""),
    ("黄金", "XAUUSD", ["xauusd"],           0, ""),
    ("黄金", "GC",     ["gold"],             0, ""),
    ("日元", "USDJPY", ["usdjpy"],           1, ""),
    ("油",   "UKOIL",  ["ukoil", "brent"],   1, ""),
    ("30年", "",       ["us30y"],            2, "%"),
    ("加息", "ZQ",     ["fedwatch_zq_sep", "fedwatch_sep_hike"], None, ""),   # 概率→百分比
]

# 显示用：指标 key → (人话名, 代号, 小数位, 是不是百分比型)
KEY_DISP = {
    "spx": ("美股", "SPX", 0, False), "gold": ("黄金", "GC", 0, False), "xauusd": ("黄金", "XAUUSD", 0, False),
    "usdjpy": ("日元", "USDJPY", 1, False), "brent": ("油", "UKOIL", 1, False), "ukoil": ("油", "UKOIL", 1, False),
    "vix": ("恐慌指数", "VIX", 1, False), "dxy": ("美元", "DXY", 1, False),
    "us30y": ("30年", "US30Y", 2, True), "us10y": ("10年", "US10Y", 2, True), "tips10y": ("真利率", "", 2, True),
    "fedwatch_sep_hike": ("加息", "ZQ", 0, None), "fedwatch_zq_sep": ("加息", "ZQ", 0, None),
    "taylor_gap": ("央行欠账", "", 2, True),
}


def _fmt(v, nd: int | None, pct_type) -> str:
    if v is None:
        return "—"
    if pct_type is None:            # 概率 0.67 → 67%
        return f"{v * 100:.0f}%"
    if nd == 0:
        return f"{v:,.0f}"
    s = f"{v:.{nd}f}"
    return s + ("%" if pct_type else "")


def _pick(key: str, quotes: dict, metrics: dict):
    """quotes.json 比 latest.json 新就用它；返回 (value, chg_1d, day_range, source_tag)。"""
    q = (quotes or {}).get(key)
    m = (metrics or {}).get(key)
    if q and q.get("value") is not None:
        return q["value"], None, None, "live"
    if m and m.get("value") is not None:
        ex = m.get("extra") or {}
        return m["value"], ex.get("chg_1d", m.get("chg_1d")), ex.get("day_range"), "snap"
    return None, None, None, None


def _price_line(quotes: dict, metrics: dict, quotes_age_min: float | None) -> str:
    parts = []
    for name, code, keys, nd, suf in PRICE_LINE:
        v = None
        for k in keys:
            v, _, _, _ = _pick(k, quotes, metrics)
            if v is not None:
                break
        if v is None:
            continue
        pct_type = None if nd is None else (suf == "%")
        label = f"{name} {code}".strip()
        parts.append(f"{label} {_fmt(v, nd, pct_type)}")
    # 黄金两个价合并成 "黄金 XAUUSD 4377 / GC 4430"
    line = " · ".join(parts).replace(" · 黄金 GC ", " / GC ")
    if quotes_age_min is not None and quotes_age_min > 60:
        line += f"（价格 {int(quotes_age_min // 60)} 小时前）"
    return "现在 · " + line


def _chg_words(key: str, metrics: dict) -> str:
    """'比昨天 +82，今天高低差 115' —— 点数，不是百分比（Momo：把数字变小变简单）。"""
    m = (metrics or {}).get(key) or {}
    ex = m.get("extra") or {}
    name, code, nd, pct_type = KEY_DISP.get(key, (key, "", 2, False))
    c = ex.get("chg_1d", m.get("chg_1d"))
    rng = ex.get("day_range")
    out = []
    if c is not None:
        out.append(f"比昨天 {c:+.{nd}f}")
    if rng is not None:
        out.append(f"今天高低差 {rng:.{nd}f}")
    return "，".join(out)


# ── 段落构造 ────────────────────────────────────────────────────────────
_BAND_KEY_DISP = {"brent": "油 UKOIL", "xauusd": "黄金 XAUUSD", "gold": "黄金 GC",
                  "usdjpy": "日元 USDJPY", "fedwatch_sep_hike": "加息 ZQ"}


def _sec_changes(changes: list[dict], metrics: dict, regime: dict) -> list[str]:
    """今天变了什么：只放 digest.changes 里的新变化。"""
    L = []
    # 判据翻转最重，放第一
    for c in changes:
        if c["kind"] == "judge":
            t = c.get("tips_chg_bp"); g = c.get("gold_chg_pct")
            nums = []
            if t is not None: nums.append(f"真利率 {t / 100:+.2f}")
            if g is not None: nums.append(f"黄金 {g:+.1f}%")
            L.append(f"· 判据翻了：近 7 天 {' 且 '.join(nums)} → {c['new']}")
            if c.get("plain"):
                L.append(f"  {c['plain']}")
    # 带子破/回
    for c in changes:
        if c["kind"] != "band":
            continue
        disp = _BAND_KEY_DISP.get(c.get("key"), c.get("label", ""))
        v = c.get("value")
        vs = _fmt(v, 0 if (v or 0) > 500 else 1, False) if c.get("key") != "fedwatch_sep_hike" else _fmt(v, None, None)
        if c["new"] == "breached_hi":
            L.append(f"· {disp} {vs}，涨破 {c['hi']:g} → {str(c.get('hi_note') or '').split('→')[-1].strip()}")
        elif c["new"] == "breached_lo":
            L.append(f"· {disp} {vs}，跌破 {c['lo']:g} → {str(c.get('lo_note') or '').split('→')[-1].strip()}")
        elif c["old"] in ("breached_hi", "breached_lo"):
            L.append(f"· {disp} {vs}，回到 {c['lo']:g}–{c['hi']:g} 之间")
        w = _chg_words(c.get("key") or "", metrics)
        if w:
            L.append(f"  {w}")
    # 节点越线/回线
    for c in changes:
        if c["kind"] != "node":
            continue
        if c["new"] == "crossed":
            L.append(f"· {c['label']}：越线 → 牵动「{c['chain']}」")
        elif c["old"] == "crossed":
            L.append(f"· {c['label']}：回到线内 → 「{c['chain']}」松一口气")
    return L[:10]


def _sec_prediction(predictions: dict, changes: list[dict], market_odds: dict | None) -> list[str]:
    """只在有新证据时出现。S 代号翻成人话。"""
    new_ev = {c["pred_id"]: c["new_items"] for c in changes if c["kind"] == "evidence"}
    if not new_ev:
        return []
    L = []
    for o in (predictions or {}).get("open_list") or []:
        if o["id"] not in new_ev or not o.get("ranking"):
            continue
        labels = o.get("scenario_labels") or {}
        order = [s.strip() for s in o["ranking"].split(">")]
        plain = " > ".join(labels.get(s, s) for s in order)
        signed = (o.get("signed_at") or "")[5:].replace("-", "-")
        settle = (o.get("settle_date") or "")[5:]
        L.append(f"■ Momo {signed} 签的 {settle} 议息判断")
        L.append(f"· 判：{plain}")
        zq = (market_odds or {}).get("zq_auto")
        if isinstance(zq, dict):          # monitor._v() 给的是 {value, as_of}
            zq = zq.get("value")
        if zq is not None:
            top_market = labels.get("S1", "加息") if zq >= 0.5 else labels.get("S2", "维持")
            agree = "一致" if order and labels.get(order[0], "") == top_market else "不一致"
            L.append(f"  市场押「{top_market}」{zq * 100:.0f}%，和判断{agree}")
        for e in new_ev[o["id"]][:2]:
            who = e.get("who") or ""
            what = (e.get("what") or "").split("」")[0].lstrip("「") + "」" if "「" in (e.get("what") or "") else (e.get("what") or "")[:60]
            L.append(f"  新证据：{who}「{what.strip('「」')}」")
            if e.get("bearing"):
                b = e["bearing"].split("。")[0]
                # evidence_log 里写的是 S1/S2/S3，推送里翻成人话
                for code, lab in labels.items():
                    b = re.sub(rf"\b{code}\b（[^）]*）", lab, b)     # "S1（加息）" → "加息25bp"
                    b = re.sub(rf"\b{code}\b", lab, b)
                L.append(f"  → {b}")
        # 最近的失效条件
        fals = o.get("falsifiers") or {}
        for fk, fv in list(fals.items())[:1]:
            L.append(f"  → 签发时写的失效条件之一：{fv.split('→')[0].strip()}")
    return L


def _sec_near(radar: list[dict], bands: list[dict], metrics: dict, quotes: dict) -> list[str]:
    """再动一点就会触发的：点数距离 + 到哪个价 + 然后会怎样。"""
    rows = []
    for r in radar or []:
        d = r.get("distance_pct")
        if d is None or not (0 < d <= 3):
            continue
        key = r.get("key") or ""
        name, code, nd, pct_type = KEY_DISP.get(key, (r.get("label", key), "", 2, False))
        v, thr = r.get("value"), r.get("threshold")
        if v is None or thr is None:
            continue
        if pct_type is None:          # 概率
            gap = f"再{'涨' if r['direction'] == 'above' else '跌'} {abs(thr - v) * 100:.1f} 个百分点到 {thr * 100:.0f}%"
        else:
            gap = f"再{'涨' if r['direction'] == 'above' else '跌'} {abs(thr - v):.{nd}f} 到 {_fmt(thr, nd, pct_type)}"
        # 后果：优先带子的 note，其次雷达 origin 后半句
        why = ""
        for b in bands or []:
            if b.get("key") == key:
                note = b.get("hi_note") if r["direction"] == "above" else b.get("lo_note")
                why = str(note or "").split("→")[-1].strip()
        if not why:
            why = str(r.get("origin") or "").split("·")[-1].strip()
        label = f"{name} {code}".strip()
        rows.append((d, f"· {label} {_fmt(v, nd, pct_type)} → {gap}，{why}"))
    rows.sort(key=lambda x: x[0])
    return [t for _, t in rows[:3]]


def _sec_watch(speech_events: list[dict], econ_today: list[dict], predictions: dict, today: str) -> list[str]:
    L = []
    tm = (dt.date.fromisoformat(today) + dt.timedelta(days=1)).isoformat()
    def day_word(d):
        return "今" if d == today else "明" if d == tm else d[5:].replace("-", "/")
    seen = set()
    for s in (speech_events or []):
        # 同一事件在两天的清单里各出现一次（"次日02:00 褐皮书" 和第二天的 "02:00 褐皮书"），去重
        k = (s.get("date"), s.get("time_bj"), s.get("title"))
        if k in seen:
            continue
        seen.add(k)
        t = f"{day_word(s['date'])} {s['time_bj']}" if s.get("time_bj") else day_word(s["date"])
        L.append(f"· {t} {s['title']}")
        if len(L) >= 5:
            break
    # 只留 ★★★ 且不是节点的经济数据
    for e in (econ_today or []):
        if e.get("importance", 0) < 3:
            continue
        tag = ""
        for o in (predictions or {}).get("open_list") or []:
            for fv in (o.get("falsifiers") or {}).values():
                if any(w in fv for w in ("非农", "CPI", "PCE")) and any(w in e.get("title", "") for w in ("非农", "CPI", "PCE")):
                    tag = " ← 和签的判断挂钩"
        L.append(f"· {day_word(e['date'])} {e['title']}{tag}")
    return L[:6]


def _sec_speeches(speeches: list[dict]) -> list[str]:
    """一人一句原话 + 意思。选词典命中且鹰鸽分最高的最短一句。"""
    by = {}
    for sp in speeches or []:
        w = sp.get("speaker") or "?"
        tone = sp.get("tone") or {}
        score = abs(tone.get("hawk", 0) - tone.get("dove", 0))
        hit = sp.get("meaning") and sp["meaning"] != "无固定套话"
        title = sp.get("title", "")
        # 排序：词典命中 > 不是【】整理稿 > 鹰鸽分 > 短。
        # 整理稿排最后——它开头是"金十数据9月2日讯，XX表示，…"，不是原话
        cand = (1 if hit else 0, 0 if title.startswith("【") else 1, score, -len(title))
        if w not in by or cand > by[w][0]:
            by[w] = (cand, sp)
    L = []
    for w, (_, sp) in by.items():
        title = sp.get("title", "")
        # 去掉【…】标题、"金十数据9月2日讯，"、"XX在发布会上表示，"、"美联储理事巴尔："这类前缀
        quote = re.sub(r"^【[^】]*】", "", title)
        quote = re.sub(r"^金十数据\d{1,2}月\d{1,2}日讯[，,]?", "", quote)
        quote = re.sub(r"^[^，,：:]{0,20}?(表示|称|说|指出)[，,]", "", quote)
        quote = re.sub(r"^.{0,14}?[：:]", "", quote).strip()
        quote = quote.split("。")[0][:60]
        role = ""
        m = re.match(r"^(.{0,12}?)(巴尔|麦克勒姆|沃什|鲍曼|沃勒|杰斐逊|库克|穆萨莱姆|哈克|戴利|古尔斯比|洛根|博斯蒂克|植田|片山|高田|贝森特)", title)
        if m:
            role = m.group(1).replace("美联储", "美联储 ").strip("：: ")
        L.append(f"· {w}（{role}）「{quote}」" if role else f"· {w}「{quote}」")
        L.append(f"  意思：{sp.get('meaning') or '无固定套话'}")
    return L[:6]


def _sec_fold(auctions: list[dict], health: dict) -> str:
    """折叠区：拍卖只在越线时；体检只在坏时。全好 → 空串（不出现）。"""
    rows = []
    bad_auc = []
    for a in (auctions or [])[:3]:
        btc, ind = a.get("bid_to_cover"), a.get("indirect_pct")
        flag = (btc is not None and btc < 2.2) or (ind is not None and ind < 50) or str(a.get("term", "")).startswith(("20", "30"))
        if flag:
            bad_auc.append(f"{a['term']} 认购 {btc}（线 2.2）海外 {ind}%（线 50%）")
    if bad_auc:
        rows.append("拍卖 · " + "；".join(bad_auc))
    probs = []
    for s in (health or {}).get("stale_list", []):
        r = str(s.get("reason") or "")
        if "staleness" in r:
            m = re.search(r"(\d+)d>(\d+)d", r)
            probs.append(f"{s.get('label') or s['key']} {m.group(1) if m else '?'} 天没更新（上限 {m.group(2) if m else '?'}）")
        elif "conflict" in r:
            m = re.search(r"([\d.]+)%", r)
            probs.append(f"{s.get('label') or s['key']} 两个源对不上（差 {m.group(1) if m else '?'}%），先停用")
        else:
            probs.append(f"{s.get('label') or s['key']} 停更")
    for x in (health or {}).get("late", []):
        probs.append(f"延迟：{x.get('msg', '')}")
    if probs:
        rows.append("体检 · " + "；".join(probs))
    return "\n".join(rows)


def _headline(changes: list[dict], regime: dict, today: str) -> str:
    """一句话结论。有判据翻转 → 用它；否则按带子/节点凑；都没有 → 安静日。"""
    for c in changes:
        if c["kind"] == "judge":
            return f"市场在为「{'更紧' if '紧缩' in c['new'] else '更松'}」定价：{c['new']}。"
    bits = []
    for c in changes:
        if c["kind"] == "band" and c["new"].startswith("breached"):
            disp = _BAND_KEY_DISP.get(c.get("key"), c.get("label", "")).split(" ")[0]
            bits.append(f"{disp}{'涨破' if c['new'].endswith('hi') else '跌破'}线")
        elif c["kind"] == "node" and c["new"] == "crossed":
            bits.append(f"{c['label']}越线")
    if bits:
        return "、".join(bits[:3]) + "。"
    jr = ((regime or {}).get("judge_result") or {}).get("verdict")
    if jr and jr != "判据未触发":
        return f"今天没有新越线。剧本判据仍是「{jr}」。"
    return "今天没有新越线。"


def build_message(latest: dict, quotes: dict | None, quotes_generated_at: str | None,
                  speech_events: list[dict] | None, speeches: list[dict] | None,
                  econ_today: list[dict] | None, today: str) -> str:
    metrics = {m["key"]: m for m in latest.get("metrics", [])}
    changes = (latest.get("digest") or {}).get("changes") or []
    regime = latest.get("regime") or {}
    preds = latest.get("predictions") or {}

    # quotes 年龄
    age = None
    if quotes_generated_at:
        try:
            g = dt.datetime.fromisoformat(quotes_generated_at.replace("Z", "+00:00"))
            age = (dt.datetime.now(dt.timezone.utc) - g).total_seconds() / 60
        except Exception:
            age = None
    lg = (latest.get("generated_at") or "")
    if quotes_generated_at and lg and quotes_generated_at < lg:
        quotes = {}          # latest 更新，别用旧行情
    quotes = quotes or {}

    out: list[str] = []
    out.append(bold(f"【{today[5:].replace('-', '-')}】{_headline(changes, regime, today)}"))
    out.append(esc(_price_line(quotes, metrics, age)))
    out.append("")

    sec = _sec_changes(changes, metrics, regime)
    if sec:
        out.append(bold("■ 今天变了什么") + "\n" + esc("\n".join(sec)))
        out.append("")

    sec = _sec_prediction(preds, changes, preds.get("market_odds"))
    if sec:
        out.append(bold(sec[0]) + "\n" + esc("\n".join(sec[1:])))
        out.append("")

    sec = _sec_near(latest.get("radar") or [], latest.get("radar_bands") or [], metrics, quotes)
    if sec:
        out.append(bold("■ 再动一点就会触发的") + "\n" + esc("\n".join(sec)))
        out.append("")

    sec = _sec_watch(speech_events or [], econ_today or [], preds, today)
    if sec:
        out.append(bold("■ 今明要盯") + "\n" + esc("\n".join(sec)))
        out.append("")

    sec = _sec_speeches(speeches or [])
    if sec:
        out.append(bold("■ 官员原话 · 意思") + "\n" + esc("\n".join(sec)))
        out.append("")

    fold = _sec_fold(latest.get("auctions") or [], latest.get("health") or {})
    if fold:
        out.append(spoiler(fold))

    return "\n".join(out).rstrip()


def send(text: str, dry: bool = False) -> bool:
    """MarkdownV2 发送；解析失败降级纯文本（去掉转义反斜杠）。token 出现在 URL 里，日志一律脱敏。"""
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
                "parse_mode": "MarkdownV2", "disable_web_page_preview": True})
            if not r.ok:
                plain = re.sub(r"\\([%s])" % re.escape(_MD2), r"\1", chunk)
                plain = plain.replace("||", "").replace("*", "")
                r = requests.post(url, timeout=30, json={"chat_id": chat, "text": plain})
            if not r.ok:
                print(f"[error] tg: {redact(r.text)[:200]}", file=sys.stderr)
                ok = False
        except Exception as e:
            print(f"[error] tg: {redact(f'{type(e).__name__}: {e}')[:200]}", file=sys.stderr)
            ok = False
    return ok
