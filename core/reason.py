"""链条推理实例化：把当前读数填进已写死的因果路径。

这**不是生成**，是填槽。所有判断依据都来自 chains.yaml 里已有的字段
（节点阈值、one_liner 因果路径、falsify 失效条件），一个字都不由模型编造。
因此可审计、可复现、零成本，且不触碰"推演由人签发"的边界——
它说的是"哪些前提成立了"，不是"所以你该怎么做"。

三件事：
  ① 单链叙述：沿因果路径列出成立/未成立的前提，标出方向是否一致
  ② 失效检查：falsify_rule（可选的可执行表达式）现在是否成立
  ③ 跨链交叉：两条链共用同一指标时，它们的结论方向是否一致或冲突
"""
from __future__ import annotations

import datetime as dt

_ORDER = {"crossed": 0, "near": 1, "quiet": 2, "fact": 3, "manual": 4, "no_data": 5}
_ZH = {"crossed": "已穿", "near": "临近", "quiet": "安静",
       "fact": "事实", "manual": "人工", "no_data": "无数据"}


def _fmt(v) -> str:
    if v is None:
        return "—"
    if isinstance(v, float):
        return f"{v:,.4g}"
    return str(v)


def _node_line(n: dict) -> str:
    st = n.get("status", "?")
    # 前提被推翻 ≠ 安静：离触发极远说明"这个前提明确不成立"，要单独显示
    tag = "前提已翻" if n.get("premise") == "broken" else _ZH.get(st, st)
    val = _fmt(n.get("value")) if n.get("value") is not None else (n.get("value_text") or "—")
    thr = ""
    if n.get("threshold") is not None:
        arrow = "↑" if n.get("direction") == "above" else "↓"
        thr = f" / 线{arrow}{_fmt(n['threshold'])}"
        d = n.get("dist_pct")
        if d is not None and st != "crossed":
            thr += f"（差{abs(d):.1f}%）"
    sh = f"　[与{len(n['shared_with'])}条链共用]" if n.get("shared_with") else ""
    return f"{tag}　{n.get('label', '')}　{val}{thr}{sh}"


def narrate_chain(chain: dict, prev_nodes: dict | None = None) -> dict | None:
    """单链实例化。prev_nodes: {label: status} 上次运行的状态，用于标出翻转。"""
    nodes = [n for n in chain.get("nodes", []) if n.get("status")]
    if not nodes:
        return None
    crossed = [n for n in nodes if n["status"] == "crossed"]
    near = [n for n in nodes if n["status"] == "near"]
    broken = [n for n in nodes if n.get("premise") == "broken"]
    # 全安静且无前提被翻：不生成叙述（系统敢于输出"无信号"）
    if not crossed and not near and not broken:
        return None

    flips = []
    if prev_nodes:
        for n in nodes:
            old = prev_nodes.get(n.get("label"))
            if old and old != n["status"] and n["status"] in ("crossed", "near"):
                flips.append(f"{n.get('label')}：{_ZH.get(old, old)} → {_ZH.get(n['status'])}")

    ordered = sorted(nodes, key=lambda n: (_ORDER.get(n["status"], 9), n.get("label", "")))
    return {
        "chain_id": chain.get("id"),
        "name": chain.get("name"),
        "heat": chain.get("heat", 0),
        "n_crossed": len(crossed),
        "n_near": len(near),
        "n_broken": len(broken),
        # 前提成立X/可判定N；被推翻的单独计——链条"没穿线"和"根基没了"是两回事
        "premise": f"{chain.get('premise_hold', 0)}/{chain.get('premise_total', 0)}",
        "premise_broken_labels": [n.get("label") for n in broken],
        # 因果路径原文——她写的，不改一个字
        "causal_path": chain.get("one_liner", ""),
        "lines": [_node_line(n) for n in ordered],
        "flips": flips,
        "falsify_text": chain.get("falsify", ""),
        "falsify_status": chain.get("falsify_status"),   # 由 build_knowledge 填
    }


def cross_chain_links(chains: list[dict]) -> list[dict]:
    """跨链交叉：同一个指标同时出现在多条链里，且已穿/临近 → 标出来。
    这是集合运算不是推断——只说"这两条链踩在同一个数上"。"""
    by_metric: dict[str, list[tuple[str, dict]]] = {}
    for c in chains:
        for n in c.get("nodes", []):
            # 按 metric 归并（此前只在节点标签相同才归到一起，导致同一个数
            # 在不同链里叫不同名字就匹配不上，交叉检测一直是空的）
            m = n.get("metric")
            if m and (n.get("status") in ("crossed", "near") or n.get("premise") == "broken"):
                by_metric.setdefault(m, []).append((c.get("name", ""), n))
    out = []
    for metric, hits in by_metric.items():
        if len(hits) < 2:
            continue
        node = hits[0][1]
        out.append({
            "metric": metric,
            "label": node.get("label"),
            "value": node.get("value"),
            "status": node.get("status"),
            "chains": [h[0] for h in hits],
            "note": f"同一个读数同时是 {len(hits)} 条链的节点——它动，这几条链一起动",
        })
    return sorted(out, key=lambda x: -len(x["chains"]))


def build_reasoning(knowledge: dict, prev_state: dict | None = None) -> dict:
    """总入口。返回可直接渲染的推理块。"""
    prev = (prev_state or {}).get("chain_nodes") or {}
    chains = knowledge.get("chains", [])
    narr = []
    for c in chains:
        r = narrate_chain(c, prev.get(c.get("id")))
        if r:
            narr.append(r)
    narr.sort(key=lambda x: (-x["n_crossed"], -x["heat"]))

    # 供下次比对：记录本次每条链的节点状态
    snapshot = {c.get("id"): {n.get("label"): n.get("status")
                              for n in c.get("nodes", []) if n.get("status")}
                for c in chains}
    return {
        "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "chains": narr,
        "cross_links": cross_chain_links(chains),
        "quiet_chains": [c.get("name") for c in chains
                         if not any(n.get("status") in ("crossed", "near")
                                    for n in c.get("nodes", []))],
        "_node_snapshot": snapshot,
        "method_note": "机械实例化：沿 chains.yaml 已写死的因果路径填入当前读数，"
                       "不生成任何新主张。判定与操作建议仍由人签发。",
    }
