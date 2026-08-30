"""经济日历数据层（自建，替代 TradingView widget）。

墙的问题：TradingView widget 是浏览器直连 s3.tradingview.com 的外链脚本，国内打不开
（2026-08-30 实测：整块空白）。本模块把日历数据在 GitHub Actions（美国服务器）侧抓好，
写进 latest.json 随站点发到自己域名，浏览器零外部请求 → 国内外看到的是同一份。

三层数据：
  ① 本周精确层  ForexFactory 周历 JSON — 预期/前值/精确到分钟，五国
  ② 未来30天骨架 FRED releases/dates — 美国官方一手发布日程（BLS/BEA/Census 的正式日期）
  ③ 中国日程    规则生成 — NBS/央行/海关的固定节奏（官方无可用API，data.stats.gov.cn 返回403）

口径纪律：
  - FF 只有 thisweek 端点可用（nextweek/thismonth 均404），且**无 actual 字段**，
    所以"实际值"不在本层，由前端用我们自己抓的 FRED 序列回填。
  - FF 把所有中国事件一律标 Low（美元交易者视角），故 CNY 不走 impact 过滤，
    重要度改用本模块自己的 CN_IMPORTANCE 判定。
  - ③层日期是按惯例推算，一律标 estimated=True，前端显示"预计"。
"""
from __future__ import annotations

import datetime as dt
import json
import os
from pathlib import Path

from .base import DataPoint, check_freshness, http_get, now_iso

FF_URL = "https://nfs.faireconomy.media/ff_calendar_thisweek.json"
FRED_RELEASES = "https://api.stlouisfed.org/fred/releases/dates"
KEEP_COUNTRIES = {"USD", "CNY", "JPY", "EUR", "GBP"}
KEEP_IMPACT = {"High", "Medium"}          # 仅对非CNY生效

# ── 事件名人话表（前缀匹配，长的排前面）────────────────────────────
TITLE_ZH = [
    # 美国
    ("Non-Farm Employment Change", "非农就业人数", 3),
    ("ADP Non-Farm Employment Change", "ADP小非农", 2),
    ("Average Hourly Earnings", "平均时薪", 2),
    ("Unemployment Claims", "初请失业金", 2),
    ("Unemployment Rate", "失业率", 3),
    ("ISM Manufacturing PMI", "ISM制造业景气度", 3),
    ("ISM Services PMI", "ISM服务业景气度", 3),
    ("ISM Manufacturing Prices", "ISM制造业物价", 2),
    ("ISM Services Prices", "ISM服务业物价", 2),
    ("JOLTS Job Openings", "职位空缺数", 2),
    ("Core CPI m/m", "核心CPI(月)", 3),
    ("Core CPI y/y", "核心CPI(年)", 3),
    ("CPI m/m", "消费者物价CPI(月)", 3),
    ("CPI y/y", "消费者物价CPI(年)", 3),
    ("Core PPI m/m", "核心PPI(月)", 2),
    ("PPI m/m", "生产者物价PPI(月)", 2),
    ("Core PCE Price Index", "核心PCE物价", 3),
    ("Core Retail Sales", "核心零售销售", 2),
    ("Retail Sales m/m", "零售销售(月)", 3),
    ("Federal Funds Rate", "美联储利率决议", 3),
    ("FOMC Statement", "美联储会后声明", 3),
    ("FOMC Press Conference", "美联储主席发布会", 3),
    ("FOMC Meeting Minutes", "美联储会议纪要", 3),
    ("Prelim GDP", "GDP初值", 3),
    ("Advance GDP", "GDP预估值", 3),
    ("Final GDP", "GDP终值", 2),
    ("CB Consumer Confidence", "消费者信心(咨商会)", 2),
    ("Prelim UoM Consumer Sentiment", "密歇根消费者信心初值", 2),
    ("UoM Inflation Expectations", "密歇根通胀预期", 2),
    ("Building Permits", "营建许可", 2),
    ("Housing Starts", "新屋开工", 2),
    ("Durable Goods Orders", "耐用品订单", 2),
    ("Industrial Production", "工业生产", 2),
    ("Trade Balance", "贸易差额", 2),
    # 中国（FF 一律标Low，重要度由我们定）
    ("Manufacturing PMI", "官方制造业PMI", 3),
    ("Non-Manufacturing PMI", "官方非制造业PMI", 3),
    ("RatingDog Manufacturing PMI", "财新制造业PMI", 3),
    ("RatingDog Services PMI", "财新服务业PMI", 2),
    ("Caixin Manufacturing PMI", "财新制造业PMI", 3),
    ("Caixin Services PMI", "财新服务业PMI", 2),
    ("New Loans", "新增人民币贷款", 2),
    ("M2 Money Supply", "M2货币供应", 2),
    ("Fixed Asset Investment", "固定资产投资", 2),
    ("Foreign Direct Investment", "外商直接投资", 1),
    ("GDP q/y", "GDP(同比)", 3),
    ("GDP y/y", "GDP(同比)", 3),
    # 日欧英
    ("BOJ Policy Rate", "日本央行利率决议", 3),
    ("BOJ Press Conference", "日本央行发布会", 3),
    ("Monetary Policy Statement", "货币政策声明", 3),
    ("Main Refinancing Rate", "欧央行利率决议", 3),
    ("Official Bank Rate", "英央行利率决议", 3),
    ("Core CPI Flash Estimate y/y", "核心CPI初值(年)", 3),
    ("CPI Flash Estimate y/y", "消费者物价CPI初值(年)", 3),
    ("Tokyo Core CPI", "东京核心CPI", 2),
    ("German Prelim CPI", "德国CPI初值", 2),
    ("Bank Holiday", "休市", 1),
    ("G20 Meetings", "G20会议", 1),
]
TITLE_ZH.sort(key=lambda x: -len(x[0]))

COUNTRY_ZH = {"USD": "美国", "CNY": "中国", "JPY": "日本", "EUR": "欧元区", "GBP": "英国", "All": "全球"}
COUNTRY_FLAG = {"USD": "🇺🇸", "CNY": "🇨🇳", "JPY": "🇯🇵", "EUR": "🇪🇺", "GBP": "🇬🇧", "All": "🌐"}

# ── "看什么"注解：只给真正能接上推理链的事件写，写不出就留空（不硬凑）──
WATCH_NOTE = {
    "非农就业人数": ("<5万或失业率>4.5% → 衰退报警器加速；>20万 → 加息预期回升", "就业链"),
    "失业率": ("升高即萨姆规则的分子。注意分母失真：劳动力收缩时会被动走低", "就业链"),
    "初请失业金": ("周频最早的就业拐点。4周均值较前4周升>15% 触发我们的E3规则", "就业链"),
    "核心PCE物价": ("美联储最看重的通胀口径，也是泰勒缺口的π。环比≤0.2%→金↑；≥0.4%→加息预期回升", "金融抑制链"),
    "消费者物价CPI(月)": ("看实际vs预期的差，不是绝对水位——低于预期即使仍高也是利好", "金融抑制链"),
    "核心CPI(月)": ("剔除食品能源，黏性主要看这个。服务/住房分项横在高位=内在通胀未消", "金融抑制链"),
    "美联储利率决议": ("全库最高信息量判别点。加息vs维持直接判别两个解释框架", "金融抑制链"),
    "美联储会后声明": ("措辞变化比决议本身信息量大——词语分析的主战场", "金融抑制链"),
    "ISM制造业景气度": ("50荣枯线。低于50且持续=需求侧走弱", ""),
    "官方制造业PMI": ("50荣枯线。中国需求端最早的月频信号，影响大宗与出口链", ""),
    "财新制造业PMI": ("样本偏中小企业与出口导向，与官方PMI背离时看谁先转向", ""),
    "居民消费价格CPI": ("中国通缩压力观测点。持续为负=内需疲弱", ""),
    "日本央行利率决议": ("加息→利差收窄→日元↑→套息平仓→美债承压。BOJ链的触发点", "日元套息链"),
    "美联储资产负债表H.4.1": ("每周四。FIMA用量在这份报告里——需手动录入", "压力链"),
    "职位空缺数": ("贝弗里奇曲线的空缺侧。低失业+低空缺=温和降温；空缺塌落=恶化", "就业链"),
    "零售销售(月)": ("消费韧性。走弱=衰退链加分", ""),
}

# ── FRED releases 关键场次（未来30天骨架层）────────────────────────
FRED_KEY = [
    ("Employment Situation", "非农就业报告", 3, "08:30"),
    ("Consumer Price Index", "消费者物价CPI", 3, "08:30"),
    ("Producer Price Index", "生产者物价PPI", 2, "08:30"),
    ("Personal Income and Outlays", "个人收支(含核心PCE)", 3, "08:30"),
    ("Gross Domestic Product", "GDP", 3, "08:30"),
    ("Advance Monthly Sales for Retail", "零售销售", 3, "08:30"),
    ("Job Openings and Labor Turnover", "职位空缺JOLTS", 2, "10:00"),
    ("H.4.1 Factors Affecting Reserve", "美联储资产负债表H.4.1", 2, "16:30"),
    ("G.17 Industrial Production", "工业生产", 2, "09:15"),
]

# ── 中国规则日程（官方无API，按公开惯例推算，一律标 estimated）────
CN_SCHEDULE = [
    # (人话名, 重要度, 日规则, 北京时间, 说明)
    ("官方制造业PMI",   3, "eom",   "09:30", "国家统计局"),
    ("官方非制造业PMI", 3, "eom",   "09:30", "国家统计局"),
    ("财新制造业PMI",   3, "bd1",   "09:45", "财新/S&P Global"),
    ("财新服务业PMI",   2, "bd3",   "09:45", "财新/S&P Global"),
    ("居民消费价格CPI", 3, "day9",  "09:30", "国家统计局"),
    ("工业品出厂价PPI", 2, "day9",  "09:30", "国家统计局"),
    ("进出口(海关)",    2, "day7",  "10:00", "海关总署"),
    ("月度经济数据",    3, "day15", "10:00", "国家统计局：工业增加值/社零/固投"),
    ("LPR报价",         2, "day20", "09:15", "中国人民银行"),
]


def _zh(title: str, country: str) -> tuple[str, int | None]:
    """英文事件名 → (人话名, 建议重要度)。未命中返回原名。"""
    for en, zh, imp in TITLE_ZH:
        if en.lower() in (title or "").lower():
            return zh, imp
    return title, None


def _nth_business_day(y: int, m: int, n: int) -> dt.date:
    d = dt.date(y, m, 1)
    cnt = 0
    while True:
        if d.weekday() < 5:
            cnt += 1
            if cnt == n:
                return d
        d += dt.timedelta(days=1)


def _eom(y: int, m: int) -> dt.date:
    return (dt.date(y, m, 1) + dt.timedelta(days=32)).replace(day=1) - dt.timedelta(days=1)


def _cn_events(days_ahead: int = 60) -> list[dict]:
    """中国日程按惯例推算（estimated=True）。"""
    out = []
    today = dt.date.today()
    end = today + dt.timedelta(days=days_ahead)
    for off in range(0, 4):
        y, m = divmod(today.month - 1 + off, 12)
        y, m = today.year + y, m + 1
        for name, imp, rule, hhmm, org in CN_SCHEDULE:
            try:
                if rule == "eom":
                    d = _eom(y, m)
                elif rule.startswith("bd"):
                    d = _nth_business_day(y, m, int(rule[2:]))
                elif rule.startswith("day"):
                    d = dt.date(y, m, int(rule[3:]))
                else:
                    continue
            except ValueError:
                continue
            if not (today <= d <= end):
                continue
            hh, mm = map(int, hhmm.split(":"))
            # 北京时间 UTC+8 → UTC
            utc = dt.datetime(d.year, d.month, d.day, hh, mm,
                              tzinfo=dt.timezone(dt.timedelta(hours=8))
                              ).astimezone(dt.timezone.utc)
            note, chain = WATCH_NOTE.get(name, ("", ""))
            out.append({
                "title": name, "title_en": name, "country": "CNY",
                "datetime": utc.isoformat(), "date": d.isoformat(),
                "importance": imp, "forecast": None, "previous": None,
                "estimated": True, "org": org, "note": note, "chain": chain,
                "src": "rule:CN_SCHEDULE",
            })
    return out


def _fred_release_events(after: dt.date, days_ahead: int = 35) -> list[dict]:
    """FRED releases/dates：美国官方发布日程（一手，骨架层，无预期值）。"""
    key = os.environ.get("FRED_API_KEY")
    if not key:
        return []
    end = dt.date.today() + dt.timedelta(days=days_ahead)
    js = http_get(FRED_RELEASES, {
        "api_key": key, "file_type": "json",
        "realtime_start": dt.date.today().isoformat(), "realtime_end": end.isoformat(),
        "include_release_dates_with_no_data": "true", "limit": 1000,
    }, timeout=30)
    out = []
    for r in js.get("release_dates", []):
        d = dt.date.fromisoformat(r["date"])
        if not (after < d <= end):        # 只补 FF 窗口之后的，避免与①层重复
            continue
        name = r.get("release_name", "")
        for kw, zh, imp, hhmm in FRED_KEY:
            if kw.lower() in name.lower():
                hh, mm = map(int, hhmm.split(":"))
                utc = dt.datetime(d.year, d.month, d.day, hh, mm,
                                  tzinfo=dt.timezone(dt.timedelta(hours=-4))
                                  ).astimezone(dt.timezone.utc)
                note, chain = WATCH_NOTE.get(zh, ("", ""))
                out.append({
                    "title": zh, "title_en": name, "country": "USD",
                    "datetime": utc.isoformat(), "date": d.isoformat(),
                    "importance": imp, "forecast": None, "previous": None,
                    "estimated": False, "org": "FRED官方日程",
                    "note": note, "chain": chain, "src": "FRED:releases",
                })
                break
    return out


def fetch(archive_dir: str | Path, max_staleness_days: int = 8) -> DataPoint:
    dp = DataPoint(key="econ_calendar", value=None, as_of=None,
                   source="ForexFactory+FRED+CN_rules", tier=2,
                   fetched_at=now_iso(), unit="events")

    arch = Path(archive_dir)
    arch.mkdir(parents=True, exist_ok=True)
    ff_cache = arch / "_ff_cache.json"

    # ① 本周精确层。FF 会限流(429)，失败时回退到本地缓存——
    #    三层里挂一层不该让另外两层也消失（降级而非全失效）。
    events, ff_last = [], dt.date.today()
    ff_status, ff_cached_at = "ok", None
    try:
        rows = http_get(FF_URL, timeout=30)
        ff_cache.write_text(json.dumps(
            {"fetched": dt.date.today().isoformat(), "rows": rows}, ensure_ascii=False),
            encoding="utf-8")
    except Exception as e:
        reason = f"{type(e).__name__}:{str(e)[:60]}"
        rows = []
        if ff_cache.exists():
            try:
                c = json.loads(ff_cache.read_text(encoding="utf-8"))
                rows = c.get("rows", [])
                ff_cached_at = c.get("fetched")
                ff_status = f"fallback_cache({ff_cached_at})"
                print(f"[warn] econ_calendar FF {reason} → 用缓存 {ff_cached_at}")
            except Exception:
                ff_status = f"unavailable({reason})"
        else:
            ff_status = f"unavailable({reason})"
            print(f"[warn] econ_calendar FF {reason} → 无缓存，本周预期值缺失")

    for r in rows:
        ctry = r.get("country")
        if ctry not in KEEP_COUNTRIES:
            continue
        # CNY 不走 impact 过滤：FF 把中国事件一律标 Low（美元视角偏见）
        if ctry != "CNY" and r.get("impact") not in KEEP_IMPACT:
            continue
        if r.get("impact") == "Holiday":
            continue
        title, imp_zh = _zh(r.get("title", ""), ctry)
        imp = imp_zh if imp_zh is not None else \
            {"High": 3, "Medium": 2}.get(r.get("impact"), 1)
        note, chain = WATCH_NOTE.get(title, ("", ""))
        d = (r.get("date") or "")[:10]
        if d:
            ff_last = max(ff_last, dt.date.fromisoformat(d))
        events.append({
            "title": title, "title_en": r.get("title"), "country": ctry,
            "datetime": r.get("date"), "date": d,
            "importance": imp,
            "forecast": r.get("forecast") or None,
            "previous": r.get("previous") or None,
            "estimated": False, "org": "ForexFactory",
            "note": note, "chain": chain, "src": "FF:thisweek",
        })

    # ② 未来30天美国官方骨架（只补 FF 窗口之后）
    try:
        events += _fred_release_events(after=ff_last)
    except Exception as e:
        print(f"[warn] fred_releases: {type(e).__name__}: {e}")

    # ③ 中国日程。去重按"标题+北京日期"——FF 的 date 字段是美东日期
    #    （中国09:30发布 = 美东前一天21:30），直接比 date 会漏判成两条。
    def _bj_date(e: dict) -> str:
        try:
            return dt.datetime.fromisoformat(e["datetime"]).astimezone(
                dt.timezone(dt.timedelta(hours=8))).date().isoformat()
        except Exception:
            return e.get("date", "")
    seen = {(e["title"], _bj_date(e)) for e in events}
    events += [e for e in _cn_events() if (e["title"], _bj_date(e)) not in seen]

    # 全局去重：同名同日只留信息最全的一条（FRED 同日多场次、跨源撞名都在这里收敛）
    best: dict[tuple, dict] = {}
    for e in events:
        k = (e["title"], _bj_date(e))
        score = (e["forecast"] is not None) * 4 + (not e["estimated"]) * 2 + bool(e["note"])
        if k not in best or score > best[k]["_score"]:
            best[k] = {**e, "_score": score}
    events = [{k: v for k, v in e.items() if k != "_score"} for e in best.values()]

    events.sort(key=lambda e: e["datetime"] or "")
    dp.value = float(len(events))
    dp.as_of = dt.date.today().isoformat()
    dp.extra["events"] = events
    dp.extra["ff_window_end"] = ff_last.isoformat()
    dp.extra["ff_status"] = ff_status

    # 周存档（按ISO周），供M5宏观日历积累
    y, w, _ = dt.date.today().isocalendar()
    (arch / f"{y}-W{w:02d}.json").write_text(
        json.dumps(events, ensure_ascii=False), encoding="utf-8")

    # 只有三层全空才算 stale；某一层缺失记在 ff_status 里，不拖垮另外两层
    if not events:
        dp.stale = True
        dp.stale_reason = f"no_events:ff={ff_status}"
        return dp
    return check_freshness(dp, max_staleness_days)
