// 盘中实时报价（浏览器直连，免密钥 + 跨域可用 + 国内可达）
//
// ⚠️ 边界（不可越）：这些都是行情站/交易所的报价，不是官方一手统计。
// 本项目铁律"二手聚合站一律不作为数据源"源自 2026-08-17 事故
// （二手站回收旧TIC数据 → 方向判断完全相反）。因此本模块产出的价格：
//   ✅ 只用于看板显示，让人扫一眼知道现在什么位置
//   ❌ 绝不进 ctx / 规则引擎 / 预测单结算 / 任何判定
// 判定链路仍只吃 yfinance(官方镜像)+FRED(官方一手)，且必须过新鲜度断言。
//
// ⚠️ 已知坏源：腾讯的 usVIX 长期显示 21.67 且涨跌恒为 0.00（现价=昨收），
// 与官方 14.43 差 42%，是典型的冻结数据。**不要接它的VIX**。
// VIX 一律用官方通道。这条是 8-17 事故形态的又一次实证。
//
// 口径（Momo 2026-08-31 指出的关键区分，她实际交易的是CFD/现货不是指数）：
//   SPX现货指数 ≠ ES期货 ≠ US500(CFD)   —— 基差约 +3
//   COMEX黄金(GC) ≠ 伦敦金现(XAUUSD)     —— 实测差约 52 美元
// 看错标的比看到旧数据更危险，故两边都显示并标明口径。
//
// 备选方案否决记录（2026-08-31 实测，避免重复调研）：
// - iframe嵌别人的行情组件：TradingView日历就是这条路，国内白屏且无法察觉；
//   密封盒子读不出数、无法交叉校验、样式套不进本站
// - Yahoo/Stooq/新浪/Finnhub/雪球/网易/富途futunn 浏览器直连：全部被同源策略挡下
//   （与是不是外国站无关，是浏览器规则）
// - Twelve Data 等需密钥的：客户端密钥在公开站必然暴露，配额被所有访客共用
// - moomoo OpenD：本地网关(localhost:11111)，云端与访客浏览器都够不到；
//   且实时行情是持牌数据，公开转发涉嫌违反服务条款

// ── 腾讯财经（免密钥，GBK编码）────────────────────────────────
const TX = 'https://qt.gtimg.cn/q='
// hf_* 外盘期货/现货：逗号分隔 [0]现价 [1]涨跌% [6]时间 [7]昨收 [12]日期 [13]名称
// us*   美股指数：~分隔 [1]名称 [3]现价 [4]昨收
const TX_HF: Record<string, [string, string]> = {
  es:   ['hf_ES',  '标普500期货'],
  xau:  ['hf_XAU', '伦敦金现 XAUUSD'],
  xag:  ['hf_XAG', '伦敦银现 XAGUSD'],
  gc:   ['hf_GC',  'COMEX黄金 GC'],
  oil:  ['hf_OIL', '布伦特原油'],
}
const TX_US: Record<string, [string, string]> = {
  spx:  ['us.INX', 'SPX现货指数'],
  ndx:  ['usNDX',  '纳斯达克100'],
}

// ── 东方财富（免密钥，覆盖外汇与美元指数）────────────────────
const EM = 'https://push2.eastmoney.com/api/qt/ulist.np/get'
const EM_SECID: Record<string, [string, string]> = {
  usdjpy: ['119.USDJPY', '美元兑日元'],
  dxy:    ['100.UDI',    '美元指数'],
}

// BTC 不走浏览器：国内门户2021年加密禁令后全下架行情，境外交易所(Coinbase/
// Binance/OKX)在国内被墙。改由 Actions 侧抓进 data/quotes.json（20分钟粒度），
// 国内外都能看到。实测 Coinbase 浏览器直连 CORS 是通的，但国内打不开，不采用。

export type LiveQuote = {
  value: number
  chg_1d_pct: number | null
  name: string
  ts: string
  src: string
}

async function withTimeout<T>(p: (signal: AbortSignal) => Promise<T>, ms: number): Promise<T | null> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try { return await p(c.signal) } catch { return null } finally { clearTimeout(t) }
}

async function fromTencent(signal: AbortSignal): Promise<Record<string, LiveQuote>> {
  const codes = [...Object.values(TX_HF), ...Object.values(TX_US)].map(x => x[0])
  const r = await fetch(TX + codes.join(','), { signal, cache: 'no-store' })
  if (!r.ok) return {}
  // 腾讯返回GBK，必须显式解码，否则中文名乱码
  const txt = new TextDecoder('gbk').decode(await r.arrayBuffer())
  const raw: Record<string, string> = {}
  for (const seg of txt.split(';')) {
    const m = seg.trim().match(/^v_([^=]+)="(.*)"$/)
    if (m && m[2]) raw[m[1]] = m[2]
  }
  const out: Record<string, LiveQuote> = {}
  for (const [key, [code, name]] of Object.entries(TX_HF)) {
    const f = raw[code]?.split(',')
    if (!f || f.length < 8) continue
    const v = Number(f[0]), chg = Number(f[1])
    if (!isFinite(v) || v <= 0) continue
    out[key] = { value: v, chg_1d_pct: isFinite(chg) ? chg : null,
                 name, ts: `${f[12] ?? ''} ${f[6] ?? ''}`.trim(), src: '腾讯财经' }
  }
  for (const [key, [code, name]] of Object.entries(TX_US)) {
    const f = raw[code]?.split('~')
    if (!f || f.length < 5) continue
    const v = Number(f[3]), prev = Number(f[4])
    if (!isFinite(v) || v <= 0) continue
    out[key] = { value: v, chg_1d_pct: isFinite(prev) && prev ? (v / prev - 1) * 100 : null,
                 name, ts: '', src: '腾讯财经' }
  }
  return out
}

async function fromEastmoney(signal: AbortSignal): Promise<Record<string, LiveQuote>> {
  const ids = Object.values(EM_SECID).map(x => x[0])
  const r = await fetch(`${EM}?fields=f1,f2,f3,f12,f13,f14&secids=${ids.join(',')}`,
                        { signal, cache: 'no-store' })
  if (!r.ok) return {}
  const j = await r.json()
  const by: Record<string, any> = {}
  for (const d of j?.data?.diff ?? []) by[`${d.f13}.${d.f12}`] = d
  const out: Record<string, LiveQuote> = {}
  for (const [key, [secid, name]] of Object.entries(EM_SECID)) {
    const d = by[secid]
    if (!d || d.f2 == null || d.f2 === '-') continue
    const v = Number(d.f2) / Math.pow(10, typeof d.f1 === 'number' ? d.f1 : 2)
    if (!isFinite(v) || v <= 0) continue
    out[key] = { value: v, chg_1d_pct: typeof d.f3 === 'number' ? d.f3 / 100 : null,
                 name, ts: '', src: '东方财富' }
  }
  return out
}

/** 拉一次实时价。任何单源失败都不影响其他源；全失败返回空，调用方继续用官方值。 */
export async function fetchLiveQuotes(timeoutMs = 6000): Promise<Record<string, LiveQuote>> {
  const parts = await Promise.all([
    withTimeout(fromTencent, timeoutMs),
    withTimeout(fromEastmoney, timeoutMs),
  ])
  return Object.assign({}, ...parts.map(p => p ?? {}))
}

/** 她实际盯的盘：口径已区分（期货/现货/CFD ≠ 指数），显示顺序即重要度 */
export const TRADING_ORDER: { key: string; label: string; note: string; dp: number }[] = [
  { key: 'es',  label: 'ES / US500', note: '标普期货 ≈ CFD报价', dp: 2 },
  { key: 'spx', label: 'SPX 指数',   note: '现货指数，仅美股时段跳', dp: 2 },
  { key: 'ndx', label: 'NQ / 纳指100', note: '指数（NQ期货无免费源）', dp: 2 },
  { key: 'xau', label: 'XAUUSD',     note: '伦敦金现', dp: 2 },
  { key: 'gc',  label: 'GC',         note: 'COMEX黄金期货', dp: 2 },
  { key: 'xag', label: 'XAGUSD',     note: '伦敦银现', dp: 3 },
  { key: 'btc', label: 'BTCUSD',     note: '20分钟粒度(国内无实时源)', dp: 0 },
  { key: 'oil', label: '布伦特原油',  note: '', dp: 2 },
]

// 快照卡的指标key ← 实时报价key 的对照表。
// 2026-09-01 修：两层命名不一致导致黄金/白银/油价的快照卡拿不到实时值
// （快照用 gold/silver/brent，实时用 gc/xag/oil），表现为"卡片不动"。
// 口径必须严格同名对应：gold 是 COMEX 期货，对应实时的 gc（也是 COMEX），
// 不能错配成 xau（伦敦金现）——那是另一个标的，差约50美元。
export const SNAPSHOT_ALIAS: Record<string, string> = {
  gold: 'gc',      // 快照的"黄金(COMEX期货)" ← 实时 COMEX 黄金
  silver: 'xag',   // 快照的"白银" ← 伦敦银现（yfinance SI=F 是COMEX，口径略差，仅显示用）
  brent: 'oil',    // 快照的"油价Brent" ← 腾讯布伦特
  xauusd: 'xau',   // 快照的"黄金(伦敦金现)" ← 实时伦敦金现
}

/** 取某个快照指标对应的实时报价（自动处理命名差异） */
export function liveFor(quotes: Record<string, LiveQuote>, snapshotKey: string): LiveQuote | undefined {
  return quotes[snapshotKey] ?? quotes[SNAPSHOT_ALIAS[snapshotKey] ?? '']
}

/** 与官方值的偏离（%）。超阈值时调用方应并列显示两个数，不择一。 */
export const DIVERGE_PCT = 0.5

export function diverges(live: number, official: number | null | undefined): boolean {
  if (official == null || !isFinite(official) || official === 0) return false
  return Math.abs(live / official - 1) * 100 > DIVERGE_PCT
}
