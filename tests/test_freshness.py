"""验收项9：构造 as_of 为30天前的假数据，断言必须标 stale。
验收项4：TIC 日程校验（系统日期设为2026-09-20，expected 应为2026-07）。
"""
import datetime as dt
import sys, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))

from fetchers.base import DataPoint, check_freshness


def _dp(as_of, value=1.0):
    return DataPoint(key="fake", value=value, as_of=as_of, source="TEST",
                     tier=1, fetched_at="2026-01-01T00:00:00Z")


def test_stale_30d():
    today = dt.date(2026, 8, 26)
    dp = _dp((today - dt.timedelta(days=30)).isoformat())
    dp = check_freshness(dp, max_staleness_days=5, today=today)
    assert dp.stale and dp.stale_reason.startswith("exceeds_max_staleness")


def test_fresh_ok():
    today = dt.date(2026, 8, 26)
    dp = check_freshness(_dp("2026-08-25"), 5, today=today)
    assert not dp.stale


def test_none_value_is_stale():
    dp = check_freshness(_dp("2026-08-25", value=None), 5, today=dt.date(2026, 8, 26))
    assert dp.stale and dp.stale_reason == "no_value"


def test_behind_schedule():
    today = dt.date(2026, 8, 26)
    dp = check_freshness(_dp("2026-05-31"), 365,
                         expected_schedule=lambda t: dt.date(2026, 6, 30),
                         today=today)
    assert dp.stale and dp.stale_reason.startswith("behind_schedule")


def test_tic_expected_month():
    from fetchers.tic import expected_tic_month
    # 验收项4：2026-09-20 ≥ 9/16发布日 → 应有7月数据（月末日期）
    assert expected_tic_month(dt.date(2026, 9, 20)) == dt.date(2026, 7, 31)
    # 9/10 < 9/16 → 只要求6月数据
    assert expected_tic_month(dt.date(2026, 9, 10)) == dt.date(2026, 6, 30)
    # 8/26 ≥ 8/17 → 应有6月数据
    assert expected_tic_month(dt.date(2026, 8, 26)) == dt.date(2026, 6, 30)


if __name__ == "__main__":
    for name, fn in sorted(globals().items()):
        if name.startswith("test_"):
            fn()
            print(f"PASS {name}")
