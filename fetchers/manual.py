"""手动录入字段：读 data/manual.json。

格式：{"fedwatch_sep_hike": {"value": 0.32, "as_of": "2026-08-20", "note": "CME网页"}}
你手动编辑后 git push，commit 时间戳即录入时间证明。
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import DataPoint, check_freshness, now_iso

MANUAL_KEYS = {
    "fedwatch_sep_hike": {"max_staleness_days": 10, "unit": "prob",
                          "desc": "CME FedWatch 9月加息概率（网页人工读数）"},
    "fima_weekly_usd": {"max_staleness_days": 10, "unit": "usd",
                        "desc": "Fed H.4.1 FIMA回购用量，每周四"},
    "war_risk_premium": {"max_staleness_days": 14, "unit": "%",
                         "desc": "霍尔木兹航运战争险费率"},
    "auction_tail_bp": {"max_staleness_days": 30, "unit": "bp",
                        "desc": "最近一场长债拍卖tail（LiveSquawk类源人工补录）"},
}


def fetch_all(manual_path: str | Path) -> list[DataPoint]:
    path = Path(manual_path)
    data = {}
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
    out = []
    fetched = now_iso()
    for key, cfg in MANUAL_KEYS.items():
        rec = data.get(key) or {}
        dp = DataPoint(key=key, value=rec.get("value"), as_of=rec.get("as_of"),
                       source=f"manual:{rec.get('note', 'data/manual.json')}",
                       tier=3, fetched_at=fetched, unit=cfg["unit"])
        if dp.value is None:
            dp.stale = True
            dp.stale_reason = "not_recorded"
            out.append(dp)
            continue
        out.append(check_freshness(dp, cfg["max_staleness_days"]))
    return out
