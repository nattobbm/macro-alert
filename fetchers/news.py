"""事件流：官方RSS + 关键词打标签（零成本，无LLM）。

源均为一手官方发布，不含二手聚合站。标签词表从26条规则反推，
只做分拣不做解读——设计边界：推演由人签发。
"""
from __future__ import annotations

import datetime as dt
import email.utils
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import requests

FEEDS = [
    ("Fed", "https://www.federalreserve.gov/feeds/press_all.xml"),
    ("Fed讲话", "https://www.federalreserve.gov/feeds/speeches.xml"),
    ("EIA", "https://www.eia.gov/rss/todayinenergy.xml"),
    ("BEA", "https://apps.bea.gov/rss/rss.xml"),
    # 2026-08-31 增地缘源。起因：霍尔木兹再起冲突、美军打击伊朗布雷火箭发射器、
    # 布伦特+2.93%破80-90区间上界，而本系统新闻流里一条相关消息都没有——
    # 地缘链有节点有阈值却没有事件输入，等于瞎的。
    #
    # 口径说明（与"二手聚合站一律不作为数据源"不冲突）：
    #   那条铁律针对的是**数字**（2026-08-17 二手站回收旧TIC数据事故）。
    #   本层取的是**事件通报**——"发生了什么"，不取任何数字。
    #   所有数字仍然只认官方API源，一条都不从新闻里读。
    # 已试过并否决的官方源：美国防部RSS(内容是宣传稿与人物故事，无中东行动)、
    #   美中央司令部(RSS返回空、直链403)、国务院(Technical Difficulties)、OFAC(403)。
    ("BBC世界", "https://feeds.bbci.co.uk/news/world/rss.xml"),
    ("CNBC能源", "https://search.cnbc.com/rs/search/combinedcms/view.xml"
                "?partnerId=wrss01&id=19836768"),
    ("OilPrice", "https://oilprice.com/rss/main"),
    ("AlJazeera", "https://www.aljazeera.com/xml/rss/all.xml"),
    # 已测不可用（2026-08-27）：Treasury/BLS/NYFed 的RSS均403/404，GDELT超时。
    # 已测不可用（2026-08-31）：Reuters/AP 的RSS域名已停止解析。
    # 已评估否决（2026-09-02）：financialjuice.com —— 内容极好（全球央行讲话逐句实时、英文、
    #   带币种标签），但走 Azure SignalR WebSocket + 登录会话 ftoken + Cloudflare Turnstile，
    #   GitHub Actions 侧无登录态拿不到。同场记者会金十快讯逐分钟都有（中文），已由
    #   jin10_flash.py 接入。financialjuice 定位=人眼看的英文快讯，不进管线。
    # 词表打标不解读；数字仍只认官方API源。
]

# 一手官方源：定义上就相关，不过相关性筛（美联储声明标题常常一个关键词都不含，
# 例如「Speech by Governor Barr on bank supervision」）。也不参与限额，永不被挤出。
OFFICIAL = {"Fed", "Fed讲话", "BEA", "EIA"}

# 非官方源的单源上限。半岛电视台 all.xml 是全站消防栓（体育/王室/社会都推），
# 按时间排序取前60会把发布频率低的官方源整个挤出去——2026-09-09 实测
# 线上60条里美联储条目 0 条。限额是为了给低频高价值源留位子。
SOURCE_CAP = {"AlJazeera": 10, "BBC世界": 8, "OilPrice": 12, "CNBC能源": 8}

# 链条标签词表（六链 + 数据发布 + 商品）。命中即打标，可多标。
# 非官方源**必须**命中至少一个，否则丢弃（见 _relevant）。
TAGS = {
    # 2026-09-09：给短词加词边界。无边界时抓到一串假命中——
    #   yen  ⊂ Fe·yen·oord   → 巴萨球赛被打成日本链
    #   repo ⊂ repo·rtedly   → 尼日利亚停火被打成货币链
    #   rate ⊂ ope·rate      → 任何"运营"都算利率
    #   discount（不限定 window/rate）⊂ 天然气"折价"→ 货币链
    #   gold（不限定边界）⊂ Gold·man → 投行名被打成黄金链
    "债务链": r"treasury|auction|refunding|buyback|\bdebt\b|deficit|\bbonds?\b|yield|issuance|QRA",
    "货币链": (r"\bfed\b|fomc|\brates?\b|federal funds|federal reserve|\brepo\b|\bQT\b|"
             r"balance sheet|SOFR|IORB|liquidity|discount window|discount rate|"
             r"\becb\b|\bboe\b|bank of england|european central bank|"
             r"lagarde|bailey|central bank"),
    "日本链": r"japan|\bboj\b|\byen\b|\bjgb\b|\bueda\b",
    # strike 单独一词误报太多（Global Strike Command / strike fighter 等美军建制名），
    # 故要求它与地缘对象连用；air/miss​ile strike 这类明确军事行动仍单独收。
    "地缘链": (r"iran|hormuz|sanction|missile|opec|\boil\b|crude|israel|tanker|"
             r"houthi|red sea|persian gulf|tehran|"
             r"ukraine|russia|russian|putin|kremlin|moscow|venezuela|"
             r"taiwan|export control|tariff|trade war|"
             r"(air|missile|drone|retaliat\w*|military)\s+strikes?|"
             r"strikes?\s+(on|against|in)\b"),
    "AI链": (r"nvidia|\bai\b|artificial intelligence|datacenter|data center|oracle|"
           r"hyperscaler|\bchips?\b"),
    "黄金链": r"\bgold\b|bullion|comex|precious",
    "数据": (r"\bcpi\b|\bppi\b|\bpce\b|payroll|employment|unemployment|\bgdp\b|"
           r"retail sales|inflation"),
    # 2026-09-09 增。起因：铜创历史新高、商品牛市转向、欧洲负电价、加州电网吃紧
    # 这几条都进了 RSS 却因为一个关键词都不命中而和体育新闻一起被同等对待。
    # 商品和电力是物价的上游，属于宏观输入。
    "商品": (r"copper|commodit\w+|\bmetals?\b|lithium|nickel|aluminium|aluminum|smelter|"
           r"minerals|\bmining\b|power price|electricity|\bgrid\b|power demand|"
           r"\blng\b|natural gas|refiner\w*|\bpipeline\b"),
}

# 硬拦：体育/娱乐/王室。即使标题里蹭到宏观词（"gold medal"命中黄金链这类）也一律丢。
# 只用体育专有词，不用国名——"Bank of England warns Iran war could push UK inflation
# above 4%" 里有 England，若拿国名拦会把真新闻拦掉。
BLOCK = re.compile(
    r"champions league|premier league|\buefa\b|\bfifa\b|world cup|olympic|"
    r"wimbledon|us open|\bnba\b|\bnfl\b|cricket|semifinals?|quarterfinals?|"
    r"invictus|gold medal|transfer window",
    re.I,
)


def _relevant(item: dict) -> bool:
    """官方源全留；其余必须命中链条词表，且不在硬拦名单里。"""
    if item.get("source") in OFFICIAL:
        return True
    if BLOCK.search(item.get("title") or ""):
        return False
    return item.get("tags") != ["其他"]


def _parse_time(s: str | None) -> str | None:
    if not s:
        return None
    try:
        return email.utils.parsedate_to_datetime(s).astimezone(
            dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return None


def _tag(title: str) -> list[str]:
    t = title.lower()
    return [name for name, pat in TAGS.items() if re.search(pat, t)] or ["其他"]


def _fetch_feed(source: str, url: str, timeout: int = 20) -> list[dict]:
    try:
        r = requests.get(url, timeout=timeout, headers={
            "User-Agent": "Mozilla/5.0 macro-alert/2.0"})
        r.raise_for_status()
        root = ET.fromstring(r.content)
    except Exception:
        return []
    items = []
    for item in root.iter("item"):
        title = (item.findtext("title") or "").strip()
        if not title:
            continue
        items.append({
            "title": title,
            "link": (item.findtext("link") or "").strip(),
            "published": _parse_time(item.findtext("pubDate")),
            "source": source,
            "tags": _tag(title),
        })
    return items[:20]


def fetch_news(store_path: str | Path, keep: int = 60) -> list[dict]:
    """拉全部源，与历史合并去重（按link），按时间倒序保留 keep 条。"""
    store_path = Path(store_path)
    old = []
    if store_path.exists():
        try:
            old = json.loads(store_path.read_text(encoding="utf-8"))
        except Exception:
            old = []
    fresh = []
    for source, url in FEEDS:
        fresh += _fetch_feed(source, url)

    seen, merged = set(), []
    for it in fresh + old:
        k = it.get("link") or it.get("title")
        if k in seen:
            continue
        seen.add(k)
        # 历史条目也过一遍筛：旧库里已经攒了大量体育/社会新闻
        if not _relevant(it):
            continue
        merged.append(it)
    merged.sort(key=lambda x: x.get("published") or "", reverse=True)

    # 官方源全留；非官方源按源限额，避免高频源把低频源挤出去
    out, used = [], {}
    for it in merged:
        src = it.get("source")
        if src in OFFICIAL:
            out.append(it)
            continue
        cap = SOURCE_CAP.get(src, 8)
        if used.get(src, 0) >= cap:
            continue
        used[src] = used.get(src, 0) + 1
        out.append(it)
    out.sort(key=lambda x: x.get("published") or "", reverse=True)
    merged = out[:keep]
    store_path.write_text(json.dumps(merged, ensure_ascii=False), encoding="utf-8")
    return merged
