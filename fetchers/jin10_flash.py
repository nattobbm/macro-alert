"""金十快讯 → 事件流（官方 MCP，1500次/工具/天，免费）。

为什么要这一层（2026-09-02）：
  Barr（理事，永久票委）9-1 21:05 讲话「若通胀未降温应果断加息」，
  我们的 RSS 新闻流 60 条里联储相关 **0 条**；我们的日历 45 条里讲话类 **1 条**（Bailey）。
  "关键日历节点公布后自动收集"在源头就漏了——讲话根本不在我们的日历上。

两件事，分开做：
  ① 讲话日程：金十的结构化日历(list_calendar)也没有讲话（0/269）。
     讲话只出现在每天 06:50 那条【今日重点关注的财经数据与事件】快讯里，
     形如「⑬ 21:05 美联储巴尔发表讲话」。从那条里正则抽出来，补进日历。
  ② 讲话内容：事件时间过后，用讲话人姓名 search_flash，取该时段的条目。

口径纪律（与 news.py 一致）：
  - 这一层取的是**事件通报**——"谁说了什么"，不取任何数字进判定。
  - 节点判定仍只认市场定价（ZQ/Polymarket）。讲话是**言论**不是**读数**，
    只做展示与证据登记，不移动任何节点。
  - 打标不解读：鹰/鸽只是关键词计数，不生成叙事。推演由人签发。
  - 返回结构是 data.items[{content,time,url}]，不是 items —— 2026-09-02 我自己的探针
    读错一层，四个关键词全返回 0 条，差点得出"金十没有联储新闻"的错结论。
"""
from __future__ import annotations

import datetime as dt
import json
import re
from pathlib import Path

from .jin10 import Jin10

# 讲话/会议类事件（从【今日重点关注】里抽）。数据发布不在这抽——那有结构化日历。
_EVENT_PAT = re.compile(
    r"^[①-⑳⑴-⒇]?\s*(?P<time>次日\d{1,2}:\d{2}|\d{1,2}:\d{2}|待定)\s*"
    r"(?P<title>.*?(讲话|发言|演讲|听证|新闻发布会|褐皮书|会议纪要|利率决议|货币政策声明).*)$"
)
# 讲话人：标题里"美联储XX"/"XX央行行长XX" 之类，抽出用于 search_flash 的关键词
_SPEAKER_PAT = re.compile(
    r"(?:美联储|欧洲央行|英国央行|日本央行|加拿大央行|澳洲联储|新西兰联储|瑞士央行)"
    r"(?:主席|理事|副主席|行长|委员|审议委员|首席经济学家)?"
    r"(?P<name>[一-龥·]{2,6}?)(?:发表讲话|讲话|发言|演讲|出席|参加|召开|主持|接受采访)"
)

# 中文链标签词表（news.py 的 TAGS 是英文正则，金十是中文，另建一套；映射到同名链）
TAGS_ZH = {
    "货币链": r"美联储|联储|FOMC|加息|降息|利率决议|褐皮书|会议纪要|沃什|巴尔|鲍曼|沃勒|杰斐逊|库克|穆萨莱姆|哈克|戴利|古尔斯比|巴尔金|洛根|博斯蒂克|卡什卡利|施密德|汉马克|库格勒",
    "债务链": r"美债|国债|收益率|财政部|贝森特|赤字|拍卖|发债|债务上限",
    "日本链": r"日本|日元|日央行|日本央行|植田|片山|高田|财务省",
    "地缘链": r"伊朗|霍尔木兹|以色列|胡塞|中东|制裁|油轮|红海|波斯湾|德黑兰|特朗普.*伊朗|空袭|导弹",
    "AI链":  r"英伟达|AI|人工智能|数据中心|甲骨文|Oracle|芯片|算力",
    "黄金链": r"黄金|金价|金矿|贵金属|COMEX|伦敦金",
    "国家博弈": r"关税|中美|贸易|上合|G7|G20|会谈|会晤|谈判|301条款",
    "数据":   r"CPI|PPI|PCE|非农|失业率|GDP|零售|PMI|JOLTS|初请",
}

# 鹰鸽关键词——只计数，不解读。数字给人看，结论人来下。
_HAWK = r"加息|果断|紧缩|根深蒂固|高于目标|仍然过高|过高|太高|不能很快放缓|保持限制|更高更久|通胀风险|时候加息"
_DOVE = r"降息|宽松|放缓|耐心|观望|时间评估|接近目标|下行风险|就业走弱|不急于"


def _tag_zh(text: str) -> list[str]:
    return [name for name, pat in TAGS_ZH.items() if re.search(pat, text)] or ["其他"]


def _tone(text: str) -> dict:
    h = len(re.findall(_HAWK, text))
    d = len(re.findall(_DOVE, text))
    return {"hawk": h, "dove": d, "lean": "鹰" if h > d else "鸽" if d > h else "中性"}


def _items(resp) -> list[dict]:
    """MCP 返回是 {data:{items:[...]}}，不是 {items:[...]}。"""
    return ((resp or {}).get("data") or {}).get("items") or []


# ── ① 从【今日重点关注】抽讲话日程 ─────────────────────────────────────
def daily_events(j: Jin10, days_back: int = 2) -> list[dict]:
    """返回最近几天的讲话/会议事件：[{date, time_bj, title, speaker, tags}]。

    金十每天 06:50 发一条【今日重点关注的财经数据与事件：YYYY年M月D日】，
    白天会更新几版（13:40 再发一条只含未发生的）。同一天取最新一版。
    """
    resp = j.call("search_flash", {"keyword": "今日重点关注的财经数据与事件"})
    latest_by_day: dict[str, dict] = {}
    for it in _items(resp):
        day = (it.get("time") or "")[:10]
        if not day:
            continue
        # 同一天取最早那版（06:50 的全量清单）；13:40 的是"剩余未发生"，会漏掉上午的
        if day not in latest_by_day or it["time"] < latest_by_day[day]["time"]:
            latest_by_day[day] = it
    cutoff = (dt.date.today() - dt.timedelta(days=days_back)).isoformat()
    out = []
    for day, it in sorted(latest_by_day.items()):
        if day < cutoff:
            continue
        for line in it.get("content", "").split("\n"):
            m = _EVENT_PAT.match(line.strip())
            if not m:
                continue
            title = m.group("title").strip()
            sp = _SPEAKER_PAT.search(title)
            t = m.group("time")
            # "次日02:00" → 日期+1
            ev_date = day
            if t.startswith("次日"):
                ev_date = (dt.date.fromisoformat(day) + dt.timedelta(days=1)).isoformat()
                t = t[2:]
            out.append({
                "date": ev_date, "time_bj": t if t != "待定" else None,
                "title": title,
                "speaker": sp.group("name") if sp else None,
                "tags": _tag_zh(title),
                "src": "jin10:今日重点关注",
                "kind": "speech" if re.search(r"讲话|发言|演讲|听证|发布会", title) else "release",
            })
    return out


# ── ② 事件过后拉讲话内容 ─────────────────────────────────────────────
def speech_after(j: Jin10, speaker: str, date: str, time_bj: str | None,
                 window_h: float = 3.0) -> list[dict]:
    """事件时间起 window_h 小时内、含讲话人姓名的快讯。返回 news.py 同形状的条目。"""
    resp = j.call("search_flash", {"keyword": speaker})
    if time_bj:
        start = dt.datetime.fromisoformat(f"{date}T{time_bj}:00+08:00")
        # 窗口提前30分钟：记者会常紧跟决议早开（9-2 加拿大央行日程写22:30，
        # 麦克勒姆 21:46 就开始说了），只从整点起算会漏掉开头最要紧的几句
        start -= dt.timedelta(minutes=30)
    else:
        start = dt.datetime.fromisoformat(f"{date}T00:00:00+08:00")
    end = start + dt.timedelta(hours=window_h) + dt.timedelta(minutes=30)
    out = []
    for it in _items(resp):
        try:
            ts = dt.datetime.fromisoformat(it["time"])
        except Exception:
            continue
        if not (start <= ts <= end):
            continue
        content = it.get("content", "").strip()
        if speaker not in content:
            continue
        out.append({
            "title": content.split("\n")[0][:140],
            "link": it.get("url", ""),
            "published": ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "source": "金十快讯",
            "tags": _tag_zh(content),
            "tone": _tone(content),
            "speaker": speaker,
        })
    out.sort(key=lambda x: x["published"])
    return out


# ── 入口：日程 + 已过事件的内容 ───────────────────────────────────────
def fetch(store_path: str | Path, keep_days: int = 3) -> dict:
    """返回 {"events": [...], "speeches": [...]}，并落盘。任何一步失败都不阻断主流程。"""
    store_path = Path(store_path)
    result = {"events": [], "speeches": [], "fetched_at":
              dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")}
    try:
        j = Jin10()
        events = daily_events(j, days_back=keep_days)
        result["events"] = events
        now_bj = dt.datetime.now(dt.timezone(dt.timedelta(hours=8)))
        for ev in events:
            if ev["kind"] != "speech" or not ev["speaker"]:
                continue
            # 只拉已经发生的
            if ev["time_bj"]:
                ev_dt = dt.datetime.fromisoformat(f"{ev['date']}T{ev['time_bj']}:00+08:00")
                if ev_dt > now_bj:
                    continue
            result["speeches"] += speech_after(j, ev["speaker"], ev["date"], ev["time_bj"])
    except Exception as e:
        result["error"] = f"{type(e).__name__}:{str(e)[:80]}"
    try:
        store_path.write_text(json.dumps(result, ensure_ascii=False, indent=1), encoding="utf-8")
    except Exception:
        pass
    return result
