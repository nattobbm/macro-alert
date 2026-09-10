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
    # 2026-09-10 补财政词：赤字这条链的输入不只有拍卖，还有花钱的决定。
    "债务链": (r"treasury|auction|refunding|buyback|\bdebt\b|deficit|\bbonds?\b|yield|"
             r"issuance|QRA|fiscal|stimulus|tax cuts?|spending bill|budget|"
             r"government shutdown|debt ceiling"),
    # rates 前面挡掉几个明确不是利率的搭配：「Oil Tanker Rates Hit Record Highs」
    # 被打成货币链，标签错了会直接显示在页面上。房贷利率(mortgage rates)是货币口径，
    # 所以不挡它。
    "货币链": (r"\bfed\b|fomc|"
             r"(?<!tanker )(?<!freight )(?<!shipping )(?<!charter )(?<!tax )\brates?\b|"
             r"federal funds|federal reserve|\brepo\b|\bQT\b|"
             r"balance sheet|SOFR|IORB|liquidity|discount window|discount rate|"
             r"\becb\b|\bboe\b|bank of england|european central bank|"
             r"lagarde|bailey|central bank"),
    "日本链": r"japan|\bboj\b|\byen\b|\bjgb\b|\bueda\b",
    # strike 单独一词误报太多（Global Strike Command / strike fighter 等美军建制名），
    # 故要求它与地缘对象连用；air/miss​ile strike 这类明确军事行动仍单独收。
    # 2026-09-10 补：第一版**整张词表里没有 china**，只有 taiwan。中美是这个站最核心的
    # 一条博弈线，一条不含 AI/关税字样的中国新闻会被整条丢掉。实测被误丢的：
    # 「US to ban imports of some Canadian alcohol, dairy goods and motorbikes」(贸易反制)、
    # 「U.S. trying to reduce its reliance on China for batteries」(供应链)、
    # 「N Korea has built two-storey uranium enrichment facility」(核扩散)。
    "地缘链": (r"iran|hormuz|sanction|missile|opec|\boil\b|crude|israel|tanker|"
             r"houthi|red sea|persian gulf|tehran|"
             r"ukraine|russia|russian|putin|kremlin|moscow|venezuela|"
             # 中国这条要带经济语境才算。光一个国名会把"中国货船起火20人死"这种
             # 事故新闻也收进来（实测它按时间排到了第0位，最显眼的槽）。
             # 反过来，一条中国新闻若一个经济/政策词都不含，按定义就不是宏观新闻。
             r"^(?=.*\b(?:china|chinese|beijing)\b)"
             r"(?=.*\b(?:trade|tariff|export|import|yuan|renminbi|pboc|central bank|"
             r"stimulus|property|chip|semiconductor|rare earth|treasur\w*|holdings|"
             r"econom\w+|growth|manufactur\w+|factory|steel|sanction|curb|ban|"
             r"supply chain|reliance|investment|\bgdp\b|deflation|inflation)\b)|"
             r"taiwan|north korea|pyongyang|"
             r"export control|tariff|trade war|embargo|\bban(s|ned)? imports?\b|"
             r"imports? of|uranium|enrichment|"
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
    # 2026-09-10 补 gasoline/diesel/batteries/coal：油价传到物价是从**加油站**传的，
    # 「Gasoline prices, over $4 per gallon, hit record high」这种直接的物价读数
    # 第一版一个词都不命中。电池/关键矿产同理，是 AI 和电网的上游。
    "商品": (r"copper|commodit\w+|\bmetals?\b|lithium|nickel|aluminium|aluminum|smelter|"
           r"minerals|\bmining\b|power price|electricity|\bgrid\b|power demand|"
           r"\blng\b|natural gas|refiner\w*|\bpipeline\b|"
           r"gasoline|\bpetrol\b|diesel|jet fuel|pump prices?|\bcoal\b|"
           r"batter(y|ies)|energy storage|hydrogen"),
}

# 硬拦：体育/娱乐/王室。即使标题里蹭到宏观词（"gold medal"命中黄金链这类）也一律丢。
# 只用体育专有词，不用国名——"Bank of England warns Iran war could push UK inflation
# above 4%" 里有 England，若拿国名拦会把真新闻拦掉。
BLOCK = re.compile(
    r"champions league|premier league|\buefa\b|\bfifa\b|world cup|olympic|"
    # 2026-09-10 修：`us open` 不加右边界会吃掉 "US opens investigation into
    # Chinese chip imports"、"US opens strategic reserve" 这类真新闻——
    # "opens" 里就含 "open"。硬拦名单误伤的代价比漏拦一条球赛大得多。
    r"wimbledon|\bus open\b|\bnba\b|\bnfl\b|cricket|semifinals?|quarterfinals?|"
    r"invictus|gold medal|transfer window",
    re.I,
)

# 美联储 press_all 里混着大量银行监管文书（对某前员工的执法处理、批准某银行的申请、
# 终止某项处罚）。2026-09-10 实测：8 条美联储条目里 6 条是这类，占着消息流的位子，
# 而真正有信息量的会议纪要和讲话反被挤到后面。只拦这一类，讲话/纪要/声明一律留。
FED_PAPERWORK = re.compile(
    r"enforcement action|civil money penalt|written agreement|cease and desist|"
    r"announces approval of application|approval of application by|"
    r"termination of enforcement|prohibition order|consent order",
    re.I,
)


def _relevant(item: dict) -> bool:
    """官方源全留（美联储的监管文书除外）；其余必须命中链条词表，且不在硬拦名单里。"""
    title = item.get("title") or ""
    if item.get("source") in OFFICIAL:
        return not (item.get("source") == "Fed" and FED_PAPERWORK.search(title))
    if BLOCK.search(title):
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
