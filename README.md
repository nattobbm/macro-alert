# macro-alert v2

宏观监控：官方一手API采集 → 新鲜度断言 → 规则引擎 → Telegram告警 + [cypermow.com](https://cypermow.com) 看板。

> **作者** nattobbm（纳豆）· [cypermow.com](https://cypermow.com)
> **代码** AGPL-3.0 ｜ **研究内容**（推理链/结论库/预测单）CC BY-NC-SA 4.0，见 [LICENSE-CONTENT.md](./LICENSE-CONTENT.md)
> 欢迎阅读、学习、自建。商用请先联系；转载研究内容请署名并注明出处。

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

## 定时与自动更新（2026-09-11 实测，别信文档里的"延迟几分钟"）

站点靠 `.github/workflows/monitor.yml` 的 `schedule` 自动更新，但**免费版 GitHub Actions 的
定时器实际延迟是小时级，而且会大量丢班**。这是实测数据，不是估计：

| 排定 | 9-09 实际 | 9-10 实际 | 9-11 实际 |
|---|---|---|---|
| 13:00Z 完整跑 | 17:05Z | 16:56Z | 16:57Z |
| 20:30Z 完整跑 | 22:37Z | 22:40Z | 22:38Z |
| 盘中轻量（每天排 16 班） | 跑了 2 班 | 跑了 3 班 | 跑了 2 班 |

**后果**：9-11 CPI 在 12:30Z 公布，加息概率当天从 73.8% 跳到 92.3%，
而网站到 16:59Z 才反映——**隔了 4.5 小时**。

### 已做的缓解（不是解决）
1. 定时分钟从整点/半点挪开（`7 13` / `37 20` / `13,43`），避开 Actions 负载最高的时刻。
2. 加息概率进了轻量通道（`--quotes-only` 现在也刷 ZQ 期货自算和 Polymarket），
   前端 `main.tsx` 的 `applyFreshHikeOdds()` 把更新的值盖到剧本卡、雷达带子、
   三源对照、链条节点四处，避免同一个数出现两种写法。

### 要真正准点，只能外部触发
`workflow_dispatch` 是即时的，没有排队延迟。任选一种：

**A. 外部 cron 服务（推荐，免费且准点）**
1. GitHub → Settings → Developer settings → Fine-grained tokens，新建一个 token，
   仓库只勾 `nattobbm/macro-alert`，权限只给 **Actions: Read and write**。
2. 到 cron-job.org（或任何 cron 服务）建任务，POST 到：
   `https://api.github.com/repos/nattobbm/macro-alert/actions/workflows/monitor.yml/dispatches`
   请求头：`Authorization: Bearer <token>`、`Accept: application/vnd.github+json`
   请求体：`{"ref":"main","inputs":{"send":"true"}}`（`send` 不传就只跑不推 TG）
3. 建议时刻（UTC，工作日）：`12:35`（8:30 美东数据公布后 5 分钟）、`20:10`（收盘后）。

⚠ token 只能你自己建和粘贴——我不能替你把密钥填进任何网页表单。

**B. 保持现状**，接受数据日最多 4 小时的滞后。雷达和链条本来就是每天两次的口径，
盘中真正在变的价格走的是轻量通道。

