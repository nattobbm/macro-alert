"""验收项10：consecutive:3 前两次不触发、第3次触发。
验收项11：依赖 stale → 状态为 skipped 而非 not_fired。
附加：once_per 去重、表达式None处理。
"""
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import datetime as dt

from core.engine import evaluate

RULES = {"t": [
    {"id": "R_consec", "name": "c", "rule": "x > 1", "consecutive": 3,
     "severity": "alert", "requires": ["x_src"]},
    {"id": "R_dep", "name": "d", "rule": "tips10y > 2.6 or tips10y < 2.0",
     "severity": "watch", "requires": ["tips10y"]},
    {"id": "R_once", "name": "o", "rule": "y > 0", "once_per": "7d",
     "severity": "alert", "requires": []},
]}


def _run(ctx, stale, state, now=None):
    return {r["id"]: r for r in evaluate(RULES, ctx, stale, state, now=now)}


def test_consecutive():
    state = {}
    ctx = {"x": 5, "tips10y": 2.4, "y": -1}
    for i, expect in [(1, "not_fired"), (2, "not_fired"), (3, "fired")]:
        res = _run(ctx, set(), state)
        assert res["R_consec"]["status"] == expect, (i, res["R_consec"])
    # 断一次归零
    res = _run({**ctx, "x": 0}, set(), state)
    assert res["R_consec"]["status"] == "not_fired"
    res = _run(ctx, set(), state)
    assert res["R_consec"]["status"] == "not_fired"   # 计数=1，未到3


def test_skipped_on_stale():
    state = {}
    res = _run({"x": 0, "tips10y": 2.7, "y": -1}, {"tips10y"}, state)
    assert res["R_dep"]["status"] == "skipped"
    assert "tips10y" in res["R_dep"]["reason"]


def test_skipped_on_missing():
    state = {}
    res = _run({"x": 0, "y": -1}, set(), state)
    assert res["R_dep"]["status"] == "skipped"


def test_once_per():
    state = {}
    t0 = dt.datetime(2026, 8, 26, tzinfo=dt.timezone.utc)
    ctx = {"x": 0, "tips10y": 2.4, "y": 1}
    assert _run(ctx, set(), state, now=t0)["R_once"]["status"] == "fired"
    assert _run(ctx, set(), state, now=t0 + dt.timedelta(days=3))["R_once"]["status"] == "fired_muted"
    assert _run(ctx, set(), state, now=t0 + dt.timedelta(days=8))["R_once"]["status"] == "fired"


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
