"""日本国债收益率 · 日本财务省官方日频 CSV。无需密钥。

2026-09-10 接入。补的是日本链上一直缺的那一环。

**为什么之前说"没有源"是我查得不够**
我先查了 yfinance（无日债代码）和 FRED（`IRLTLT01JPM156N` 属已停摆的 OECD 数据族，
最后更新 2026-07-16），就下结论说装不上。Momo 让我再找找——
**日本财务省自己就公布**，而且是最一手的：日频、1年到40年全期限、免密钥、可追到 1974-09-24。
教训同 [[dont-punt-researchable-decisions]]：说"没有"之前先把官方发布方本身查一遍。

**两个文件**
- `jgbcme.csv`（约 1KB）：当月，最新。每次都拉。
- `historical/jgbcme_all.csv`（约 1.2MB，13,292 行，1974 至今）：**只在本地序列不足时拉一次**做回填。
  这个大文件本身滞后约 10 天（实测 8-31），所以最新值一定要从当月文件取。

**口径**
"Interest Rate"表，各期限的**流通市场利率（複利/semi-annual compound）**，单位 %。
缺值用 `-`（老年份的长期限还没发行）。

**为什么盯 10 年和 30 年**
艾丽那条链是：日元贬 → 日本输入性通胀 → 发债增加 → **日债收益率升 → 对冲基金日债亏损
被追保证金 → 卖掉流动性最强的美债** → 美债收益率上行 → AI 巨头发债成本上升。
造成亏损的是收益率上行本身，长端（30/40年）幅度最大，10 年是最被盯的那个价。
2026-09 实测：10年 2.891%、30年 3.956%，**都在近十年的 100% 分位**。
"""
from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

import requests

from .base import DataPoint, check_freshness, now_iso

CUR = "https://www.mof.go.jp/english/policy/jgbs/reference/interest_rate/jgbcme.csv"
ALL = ("https://www.mof.go.jp/english/policy/jgbs/reference/"
       "interest_rate/historical/jgbcme_all.csv")
_UA = {"User-Agent": "Mozilla/5.0 macro-alert/2.0"}

# 我们要的期限 → 指标 key
WANT = {"10Y": "jp10y", "30Y": "jp30y"}
SEED_MIN = 250          # 本地序列少于这么多点就回填一次大文件


def _parse(text: str) -> dict[str, dict[str, float]]:
    """CSV → {日期: {'10Y': v, '30Y': v}}。缺值('-'/空)跳过，不写 0。"""
    hdr: list[str] | None = None
    out: dict[str, dict[str, float]] = {}
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        if line.startswith("Date"):
            hdr = [c.strip() for c in line.split(",")]
            continue
        if not hdr or not line[0].isdigit():
            continue
        parts = line.split(",")
        try:
            d = dt.datetime.strptime(parts[0].strip(), "%Y/%m/%d").date().isoformat()
        except ValueError:
            continue
        row: dict[str, float] = {}
        for tenor in WANT:
            try:
                raw = parts[hdr.index(tenor)].strip()
            except (ValueError, IndexError):
                continue
            if raw in ("-", ""):
                continue
            try:
                row[tenor] = float(raw)
            except ValueError:
                continue
        if row:
            out[d] = row
    return out


def _get(url: str, timeout: int) -> str:
    r = requests.get(url, headers=_UA, timeout=timeout)
    r.raise_for_status()
    return r.content.decode("utf-8", "replace")


def fetch_all(store_dir: str | Path, max_staleness_days: int = 5) -> list[DataPoint]:
    store_dir = Path(store_dir)
    store_dir.mkdir(parents=True, exist_ok=True)
    store_file = store_dir / "jgb_yields.json"

    hist: dict[str, dict[str, float]] = {}
    if store_file.exists():
        try:
            hist = json.loads(store_file.read_text(encoding="utf-8"))
        except Exception:
            hist = {}

    err = None
    try:
        # 本地点数不够就先回填一次大文件（只发生在首次或存档丢失时）
        if len(hist) < SEED_MIN:
            hist.update(_parse(_get(ALL, 120)))
        hist.update(_parse(_get(CUR, 45)))      # 当月覆盖，保证拿到最新
    except Exception as e:
        err = f"fetch_error:{type(e).__name__}:{e}"

    # 存档只留近 5 年（约 1250 个交易日，≈40KB）。大文件回填能追到 1974 年，
    # 但 data/ 每次跑都要进 git，389KB 的全历史每天重写不值当；
    # 5 年足够画图、算 20 日变动和分位。真要更长的历史，大文件随时能重拉。
    if hist:
        _cut = (dt.date.today() - dt.timedelta(days=365 * 5 + 30)).isoformat()
        hist = {d: v for d, v in hist.items() if d >= _cut}
        store_file.write_text(json.dumps(hist, ensure_ascii=False,
                                         sort_keys=True), encoding="utf-8")

    out: list[DataPoint] = []
    dates = sorted(hist)
    for tenor, key in WANT.items():
        dp = DataPoint(key=key, value=None, as_of=None,
                       source=f"MOF_Japan:JGB_{tenor}", tier=1,
                       fetched_at=now_iso(), unit="%")
        have = [d for d in dates if tenor in hist[d]]
        if not have:
            dp.stale = True
            dp.stale_reason = err or "no_data"
            out.append(dp)
            continue
        last = have[-1]
        dp.value = hist[last][tenor]
        dp.as_of = last
        dp.extra["series"] = [[d, hist[d][tenor]] for d in have[-500:]]
        prev = hist[have[-2]][tenor] if len(have) > 1 else None
        if prev is not None:
            dp.extra["chg_1d"] = round(dp.value - prev, 4)
        if len(have) > 21:
            dp.extra["chg_20d"] = round(dp.value - hist[have[-21]][tenor], 4)
        if err:
            dp.extra["fetch_warning"] = err     # 用了存档但这次没拉到新的
        out.append(check_freshness(dp, max_staleness_days))
    return out


if __name__ == "__main__":       # 手查用
    for d in fetch_all("data/jgb"):
        print(d.key, d.value, d.as_of, "stale" if d.stale else "ok",
              d.stale_reason, "20日变动", d.extra.get("chg_20d"),
              "序列", len(d.extra.get("series") or []))
