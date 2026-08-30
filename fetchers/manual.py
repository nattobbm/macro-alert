"""手动录入字段：读 data/manual.json。

格式：{"fedwatch_sep_hike": {"value": 0.32, "as_of": "2026-08-20", "note": "CME网页"}}
你手动编辑后 git push，commit 时间戳即录入时间证明。
"""
from __future__ import annotations

import json
from pathlib import Path

from .base import DataPoint, check_freshness, now_iso

# 全部 optional=True：不填不报警、不计入数据健康分母。
# 判定纪律不变——规则仍会因变量缺失而 skipped，只是不再当成"数据出问题"。
# 2026-08-31：fima_weekly_usd 移出本表，改由 FRED H41RESPPALGTRFNWW 自动抓取。
MANUAL_KEYS = {
    "fedwatch_sep_hike": {"max_staleness_days": 10, "unit": "prob", "optional": True,
                          "desc": "CME FedWatch 9月加息概率（三源对照用；缺失时规则回落ZQ自算值）"},
    "war_risk_premium": {"max_staleness_days": 14, "unit": "%", "optional": True,
                         "desc": "霍尔木兹航运战争险费率（无免费源，纯标注，不影响任何规则）"},
    "auction_tail_bp": {"max_staleness_days": 30, "unit": "bp", "optional": True,
                        "desc": "长债拍卖真实tail精修（缺失时用合成值 tail_bp_synthetic）"},
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
        dp.extra["optional"] = bool(cfg.get("optional"))
        dp.extra["desc"] = cfg["desc"]
        if dp.value is None:
            dp.stale = True
            # optional 未录入不是"数据出问题"，健康报告里单独归类，不进告警
            dp.stale_reason = "optional_unfilled" if cfg.get("optional") else "not_recorded"
            out.append(dp)
            continue
        out.append(check_freshness(dp, cfg["max_staleness_days"]))
    return out
