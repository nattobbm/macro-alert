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
            # 2026-09-01 修：锁定判定原来只认 probability，但情景图格式
            # (scenario_map) 没有概率字段——它签的是 momo_ranking + 一句理由。
            # 结果 Momo 亲笔签发的卡在看板上显示成"未锁定"。
            # 以 status 字段为准，兼容旧的概率单。
            st = j.get("status")
            locked = (st in ("LOCKED", "SETTLED")
                      or j.get("momo_ranking") is not None
                      or j.get("probability") is not None)
            opens.append({"id": j.get("id"), "question": j.get("question"),
                          "probability": j.get("probability"),
                          "ranking": j.get("momo_ranking"),
                          "format": j.get("format", "probability"),
                          "status": st,
                          "settle_date": j.get("settle_date"),
                          "locked": locked,
                          # 签发后的证据（只追加，不动锁定字段）。前端显示条数+最新一条，
                          # 让看的人知道"签了之后世界发生了什么"，但排序不会因此改
                          "falsifiers": j.get("falsifiers") or {},
                          "evidence": [
                              {"at": e.get("event_time_bj") or e.get("logged_at"),
                               "who": e.get("who"), "what": e.get("what"),
                               "bearing": e.get("bearing"), "source": e.get("source")}
                              for e in (j.get("evidence_log") or [])
                          ]})
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
