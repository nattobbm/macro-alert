# macro-alert v2

宏观监控：官方一手API采集 → 新鲜度断言 → 规则引擎 → Telegram告警 + [cypermow.com](https://cypermow.com) 看板。

**设计边界：本系统只做采集、阈值触发、状态播报，不自动生成推演。** 推演由人签发（`predictions/` 预注册 + git commit 时间戳），自动化只负责在结算日把实际数据摆到面前。

## 起因

2026-08-17 引用二手聚合站一篇回收旧TIC数据的文章，导致对英中美债持仓方向判断完全相反。因此本系统第一优先级不是数据多，而是**数据新鲜度可验证**：

- 所有数字必须携带 `source` + `as_of`
- stale 数据不参与规则判定，改为数据健康告警（H1）
- 二手聚合站一律不作为数据源
- 全部免费API，无付费订阅

## 架构

```
GitHub Actions (cron 平日2次)
  └─ monitor.py
      ├─ fetchers/   FRED·FiscalData·TIC·TreasuryDirect·CFTC·NYFed·EIA·yfinance·manual
      │              全部返回 DataPoint{value, as_of, source, tier, stale}
      ├─ core/engine 规则判定（simpleeval + requires + consecutive + once_per）
      ├─ data/latest.json  看板唯一数据契约
      ├─ core/notify Telegram推送（数据健康区块置顶）
      └─ Pages 部署 web/ + data/ → cypermow.com
```

## 本地运行

```bash
pip install -r requirements.txt
# .env: FRED_API_KEY / EIA_API_KEY / TG_BOT_TOKEN / TG_CHAT_ID
python monitor.py --dry-run     # 全流程不推送
python tests/test_freshness.py  # 验收9/4
python tests/test_engine.py     # 验收10/11
```

## 手动字段

无免费API的指标走 `data/manual.json`（模板见 `config/manual.example.json`）：
fedwatch_sep_hike（CME网页读数）、fima_weekly_usd（H.4.1）、war_risk_premium、auction_tail_bp。
编辑后 push，commit 时间戳即录入证明。超过 max_staleness_days 未更新自动标 stale，依赖它的规则跳过。

## 数据源差异登记

| 项 | 规格书 | 实际 |
|---|---|---|
| TIC月度 | mfhhis01.txt | 该文件是年度历史；月度数据在 `slt_table5.txt`（tab分隔，含近13月列） |
| TIC基准 | Japan 1117.0 | 官方修订为 1116.7（UK/China 及三国环比与基准精确一致） |
| tail/WI | API无 | 手动值优先，缺失回落合成值 `highYield−前日FRED同期限收盘`，看板标注"合成" |

## 维护纪律

- 阈值修改必须在 rules.yaml 注明理由与日期，禁止事后无痕调参
- `baseline` 记录设定阈值时的现状，用于回看阈值是否过时
- 假说类规则样本 <8 只加样不下结论
- 预测：锁定后禁改 probability/reasoning；样本 <50 只记录不解读（见 `predictions/README.md`）
