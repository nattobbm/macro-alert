"""规则引擎 v2（规格书§6）。

1. requires 依赖检查：任一依赖 stale/缺失 → skipped（附原因，不算未触发）
2. consecutive: N — 连续N次成立才触发，计数器存 state，条件不成立归零
3. once_per: "7d" — 触发去重，窗口内不重复推送（状态仍记 fired_muted）
4. 表达式求值用 simpleeval（禁 eval）
5. 输出 {id, name, status, severity, chain, falsify, inputs}
"""
from __future__ import annotations

import datetime as dt
import re

from simpleeval import SimpleEval

SEVERITY_ORDER = ["info", "watch", "alert", "critical"]


def _parse_once_per(s: str) -> dt.timedelta:
    m = re.fullmatch(r"(\d+)([dh])", s.strip())
    if not m:
        raise ValueError(f"bad once_per: {s}")
    n, unit = int(m.group(1)), m.group(2)
    return dt.timedelta(days=n) if unit == "d" else dt.timedelta(hours=n)


def _rule_vars(expr: str) -> set[str]:
    return set(re.findall(r"[a-zA-Z_][a-zA-Z0-9_]*", expr)) - {
        "and", "or", "not", "abs", "is", "None", "True", "False", "in"}


def evaluate(rules: dict, ctx: dict, stale_keys: set[str], state: dict,
             now: dt.datetime | None = None) -> list[dict]:
    """rules: rules.yaml 加载结果；ctx: 变量字典；stale_keys: stale 的 DataPoint key。
    state: {"counters": {}, "last_fired": {}} — 原地更新，由调用方持久化。
    返回全部规则的结构化结果（fired/not_fired/skipped/fired_muted/manual）。
    """
    now = now or dt.datetime.now(dt.timezone.utc)
    state.setdefault("counters", {})
    state.setdefault("last_fired", {})
    results = []

    ev = SimpleEval()
    ev.functions["abs"] = abs

    for domain, items in rules.items():
        if domain in ("meta", "calendar") or not isinstance(items, list):
            continue
        for r in items:
            rid = r["id"]
            expr = r.get("rule", "")
            base = {"id": rid, "name": r.get("name", rid), "domain": domain,
                    "severity": r.get("severity", "info"),
                    "chain": r.get("chain", ""), "falsify": r.get("falsify", ""),
                    "baseline": r.get("baseline", "")}

            if expr == "manual":
                results.append({**base, "status": "manual", "inputs": {}})
                continue

            # 依赖检查：requires 中任一 stale → skipped
            reqs = r.get("requires", [])
            stale_deps = [k for k in reqs if k in stale_keys]
            if stale_deps:
                state["counters"][rid] = 0
                results.append({**base, "status": "skipped",
                                "reason": f"stale_deps:{','.join(stale_deps)}",
                                "inputs": {}})
                continue

            # 表达式变量缺失 → skipped（不误报）
            needed = _rule_vars(expr)
            missing = [v for v in needed if v not in ctx or ctx[v] is None]
            # tail 类变量允许 None（表达式里显式判 None）
            missing = [v for v in missing if f"{v} is not None" not in expr]
            if missing:
                state["counters"][rid] = 0
                results.append({**base, "status": "skipped",
                                "reason": f"missing_vars:{','.join(missing)}",
                                "inputs": {}})
                continue

            ev.names = {**{k: ctx.get(k) for k in needed}, "None": None,
                        "True": True, "False": False}
            try:
                val = bool(ev.eval(expr))
            except Exception as e:
                results.append({**base, "status": "skipped",
                                "reason": f"eval_error:{type(e).__name__}:{e}",
                                "inputs": {k: ctx.get(k) for k in needed}})
                continue

            inputs = {k: ctx.get(k) for k in needed}
            if not val:
                state["counters"][rid] = 0
                results.append({**base, "status": "not_fired", "inputs": inputs})
                continue

            # consecutive
            need = int(r.get("consecutive", 1))
            cnt = state["counters"].get(rid, 0) + 1
            state["counters"][rid] = cnt
            if cnt < need:
                results.append({**base, "status": "not_fired", "inputs": inputs,
                                "consecutive": f"{cnt}/{need}"})
                continue

            # once_per 去重
            if "once_per" in r:
                last = state["last_fired"].get(rid)
                window = _parse_once_per(r["once_per"])
                if last and now - dt.datetime.fromisoformat(last) < window:
                    results.append({**base, "status": "fired_muted",
                                    "inputs": inputs,
                                    "reason": f"once_per:{r['once_per']},last={last[:16]}"})
                    continue

            state["last_fired"][rid] = now.isoformat()
            results.append({**base, "status": "fired", "inputs": inputs,
                            **({"consecutive": f"{cnt}/{need}"} if need > 1 else {})})

    return results
