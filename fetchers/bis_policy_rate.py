"""国际清算银行（BIS）央行政策利率。无需密钥。

2026-09-10 接入。起因与口径说明：

**为什么换掉 FRED**
原来日韩政策利率走 FRED 的 OECD 主要经济指标（`IRSTCI01JPM156N` / `IRSTCI01KRM156N`）。
两个问题，第二个比第一个严重：

1. **源停了**：两条序列在 2026-07-16 之后再没更新过，最新数据周期停在 2026-06。
   不是月频滞后（正常滞后约 1.5 个月），是停。同一个 FRED release（205 Main Economic
   Indicators）里抽查 1000 条，只有 1 条观测到 2026-07 之后——整个数据族都在停摆，
   换同族的兄弟序列没有意义。

2. **口径本来就不对**：`IRSTCI` = Immediate Rates, Call Money/Interbank Rate，
   是**市场实际成交的隔夜拆借利率月均值**，不是央行定的政策利率。
   实测差别有多大：2026-06 那期 FRED 给日本 0.841，而日本央行从 2026-06-17 起
   把无担保隔夜拆借利率目标定在 **1.00%**。链条节点的线是 0.85 ——
   拿 0.841 判就是"没越线"，拿 1.00 判就是"已越线"。**同一天，口径不同，结论相反。**
   这正是"期货≠现货≠指数"那条纪律在利率上的版本：实际成交均值 ≠ 政策目标。

**BIS 这个源好在哪**
- 数据集 `WS_CBPOL` 就叫 Central bank policy rates，口径写在数据里（`COMPILATION` 字段），
  不用我们猜。日本那条自己写着"the BOJ encourages the uncollateralized overnight call
  rate to remain at around 1.00 percent"；韩国那条写着"Bank of Korea base rate"。
- 免密钥、一手（BIS 直接向各国央行收集）、一个接口覆盖所有主要央行。
- 日频，所以"哪一天改的"能直接看出来，不像月频要等下个月才知道。

**已知短板（写在这里免得以后当成 bug 查）**
BIS 各国更新节奏不一样。实测 2026-09-10：日本/美国/欧元区最新到 2026-09-01（9 天），
**韩国最新只到 2026-08-03（38 天）**。所以韩国刚加息时我们会晚几周才看到。
这是 BIS 的发布节奏，不是抓取失败。max_staleness 因此放到 90 天：
政策利率本来就几个月才动一次，值在两次会议之间一直有效；真断更（连着两个季度不发）
仍然报得出来。
"""
from __future__ import annotations

import csv
import datetime as dt
import io

import requests

from .base import DataPoint, check_freshness, now_iso

API = "https://stats.bis.org/api/v1/data/WS_CBPOL/D.{area}/all"

# key → (BIS 地区码, 人话名)。BIS 用 XM 表示欧元区。
AREAS = {
    "jp_rate": ("JP", "日本央行政策利率"),
    "kr_rate": ("KR", "韩国央行政策利率"),
}


def _fetch_one(key: str, area: str, label: str, max_staleness_days: int) -> DataPoint:
    dp = DataPoint(key=key, value=None, as_of=None,
                   source=f"BIS:WS_CBPOL/D.{area}", tier=1,
                   fetched_at=now_iso(), unit="%")
    try:
        r = requests.get(API.format(area=area),
                         params={"lastNObservations": 400, "format": "csv"},
                         headers={"User-Agent": "macro-alert/2.0"}, timeout=45)
        r.raise_for_status()
        rows = [x for x in csv.DictReader(io.StringIO(r.content.decode("utf-8", "replace")))
                if (x.get("OBS_VALUE") or "").strip()]
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"fetch_error:{type(e).__name__}:{e}"
        return dp
    if not rows:
        dp.stale = True
        dp.stale_reason = "empty_response"
        return dp
    last = rows[-1]
    try:
        dp.value = float(last["OBS_VALUE"])
        dp.as_of = last["TIME_PERIOD"][:10]
    except Exception as e:
        dp.stale = True
        dp.stale_reason = f"parse_error:{type(e).__name__}:{e}"
        return dp

    # 日频序列全存下来没意义（几个月才动一次），只留"变动点"：
    # 每次利率真的改了记一条，页面上就能直接读出"哪天加的、从多少到多少"。
    steps: list[list] = []
    prev = None
    for x in rows:
        v = x["OBS_VALUE"]
        if prev is None or v != prev:
            try:
                steps.append([x["TIME_PERIOD"][:10], float(v)])
            except ValueError:
                pass
        prev = v
    dp.extra["steps"] = steps[-12:]
    dp.extra["label"] = label
    # BIS 自己写的口径说明，原样带上（前端"?"里可以直接给人看）
    note = (last.get("COMPILATION") or "").strip()
    if note:
        dp.extra["caliber_note"] = note[:400]
    if len(steps) >= 2:
        dp.extra["last_change"] = {"date": steps[-1][0],
                                   "from": steps[-2][1], "to": steps[-1][1]}
    return check_freshness(dp, max_staleness_days)


def fetch_all(sources: dict) -> list[DataPoint]:
    out = []
    for key, (area, label) in AREAS.items():
        cfg = (sources or {}).get(key) or {}
        out.append(_fetch_one(key, area, label,
                              cfg.get("max_staleness_days", 90)))
    return out


if __name__ == "__main__":       # 手查用
    for d in fetch_all({}):
        print(d.key, d.value, d.as_of, d.stale, d.stale_reason,
              d.extra.get("last_change"), dt.date.today())
