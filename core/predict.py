"""预测日志统计（P8）。Brier 手算（(p-o)^2 均值），不引 sklearn。
硬规矩：样本<50 只记录不解读。
"""
from __future__ import annotations

import json
from pathlib import Path


def scorecard(pred_dir: str | Path) -> dict:
    pred_dir = Path(pred_dir)
    open_files = sorted((pred_dir / "open").glob("*.json"))
    settled_files = sorted((pred_dir / "settled").glob("*.json"))

    briers = []
    settled = []
    for f in settled_files:
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
        except Exception:
            continue
        p, o = j.get("probability"), j.get("outcome")
        if p is not None and o in (0, 1):
            briers.append((p - o) ** 2)
        settled.append({"id": j.get("id"), "outcome": o, "probability": p,
                        "quality_self_score": j.get("quality_self_score")})

    opens = []
    for f in open_files:
        try:
            j = json.loads(f.read_text(encoding="utf-8"))
            opens.append({"id": j.get("id"), "question": j.get("question"),
                          "probability": j.get("probability"),
                          "settle_date": j.get("settle_date"),
                          "locked": j.get("probability") is not None})
        except Exception:
            continue

    n = len(briers)
    return {
        "open": len(opens), "settled": len(settled),
        "open_list": opens, "settled_list": settled,
        "brier": round(sum(briers) / n, 4) if n else None,
        "n_for_brier": n,
        "note": "样本<50，仅记录不解读" if n < 50 else "",
    }
