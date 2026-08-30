// 真数据适配层：latest.json(macro-alert数据契约) → 各页面的形状
// main.tsx 在渲染前 fetch 并挂到 window.__LATEST；本模块同步读取。
// 任一字段缺失时回落到 mock，保证页面永不空白。
import * as mock from './mock'
import { isEN } from '../i18n'
import type { OHLC, Snapshot, Alert, Chain, ChainNode, Verdict, Prediction, NewsItem, CalEvent, AuctionRow, AlertRule, GexBar, DataSource } from './mock'

const L: any = (globalThis as any).__LATEST ?? null
export const isLive = !!L

const fmt = (v: any, d = 2) =>
  v == null ? '—' : Number(v).toLocaleString('en-US', { maximumFractionDigits: Math.abs(v) >= 1000 ? 0 : d })

const byKey: Record<string, any> = {}
if (L) for (const m of L.metrics ?? []) byKey[m.key] = m

// ── 快照 ──
const SNAP_KEYS = ['spx', 'vix', 'gold', 'silver', 'dxy', 'usdjpy', 'brent', 'us10y', 'us30y', 'tips10y', 'move', 'avg_rate', 'curve_10y2y', 'icsa', 'sahm_rule', 'unrate', 'core_pce']
export const snapshots: Snapshot[] = L
  ? SNAP_KEYS.filter(k => byKey[k]).map(k => {
      const m = byKey[k]
      return {
        key: k, label: (isEN && m.label_en) ? m.label_en : m.label, value: fmt(m.value) + (m.unit === '%' ? '%' : ''),
        change: m.chg_1d_pct ?? m.chg_1d ?? 0,
        unit: m.unit === '%' ? '' : (m.unit ?? ''),
        as_of: m.as_of ?? '—', source: (m.source ?? '').split(':')[0],
        spark: (L.series?.[k] ?? []).slice(-40).map((p: any) => p[1]),
        role: m.role ?? null,
      }
    })
  : mock.snapshots

// ── 警戒线雷达 ──
export const alerts: Alert[] = L
  ? (L.radar ?? []).map((r: any, i: number) => ({
      id: `${r.rule_id}_${i}`,
      name: `${(isEN && r.label_en) ? r.label_en : r.label} ${r.direction === 'above' ? '↑' : '↓'}${fmt(r.threshold)}`,
      current: fmt(r.value),
      threshold: fmt(r.threshold),
      distance_pct: -r.distance_pct,   // mock语义：负=未到，正/0=越线
      status: r.distance_pct <= 0 ? 'breached' : r.distance_pct < 5 ? 'warning' : 'ok',
      rule_source: r.rule_id,
      origin: (isEN && r.origin_en) ? r.origin_en : (r.origin ?? ''),
      key: r.key,
    }))
  : mock.alerts

// ── 双边警戒带（油/金/日元/加息概率：一条带子两个出口） ──
export type RadarBand = {
  id: string; key: string; lo: number; hi: number; unit: string
  label: string; lo_note: string; hi_note: string; origin: string
  value: number; position: number; dist_lo_pct: number; dist_hi_pct: number
  status: 'in_band' | 'near' | 'breached_lo' | 'breached_hi'
}
export const radarBands: RadarBand[] = (L?.radar_bands ?? []).map((b: any) => ({
  ...b,
  label: (isEN && b.label_en) ? b.label_en : b.label,
  lo_note: (isEN && b.lo_note_en) ? b.lo_note_en : b.lo_note,
  hi_note: (isEN && b.hi_note_en) ? b.hi_note_en : b.hi_note,
  origin: (isEN && b.origin_en) ? b.origin_en : b.origin,
}))
// 已并入带子的雷达行，从单行列表里去掉（band成员key）
const BAND_KEYS = new Set(radarBands.map(b => b.key))
export const alertsNoBands: Alert[] = radarBands.length
  ? alerts.filter((a: any) => !BAND_KEYS.has(a.key))
  : alerts

// ── 逻辑链 ──
const NODE_STATUS: Record<string, ChainNode['status']> = {
  crossed: 'fire', near: 'warning', quiet: 'ok', fact: 'fact', manual: 'fact', no_data: 'fact',
}
export const chains: Chain[] = L
  ? (L.knowledge?.chains ?? []).map((c: any) => ({
      id: c.id,
      title: `${c.emoji ?? ''} ${(isEN && c.name_en) ? c.name_en : c.name} — ${((isEN && c.one_liner_en) ? c.one_liner_en : c.one_liner)?.slice(0, 60) ?? ''}`,
      heat: Math.min(100, 20 + (c.heat ?? 0) * 20),
      invalidation: (isEN && c.falsify_en) ? c.falsify_en : (c.falsify ?? ''),
      nodes: (c.nodes ?? []).map((n: any): ChainNode => ({
        label: (isEN && n.label_en) ? n.label_en : n.label,
        value: n.value != null ? fmt(n.value) : (n.value_text ?? '—'),
        threshold: n.threshold != null ? `${n.direction === 'above' ? '↑' : '↓'}${fmt(n.threshold)}` : '',
        status: NODE_STATUS[n.status] ?? 'fact',
        term: n.term ?? '',
      })),
    }))
  : mock.chains

// ── 结论库 ──
const VERDICT_MAP: Record<string, Verdict['status']> = {
  '已证实': 'true', '已证伪': 'false', '未决': 'pending', '假设(加样中)': 'testing', '事实': 'fact',
}
export const verdicts: Verdict[] = L
  ? (L.knowledge?.conclusions ?? []).map((c: any) => ({
      id: c.id, status: VERDICT_MAP[c.verdict] ?? 'pending',
      claim: (isEN && c.claim_en) ? c.claim_en : c.claim,
      evidence: [c.number, c.evidence].filter(Boolean).join('；'),
      source: c.source ?? '',
    }))
  : mock.verdicts

// ── 预测 ──
export const predictions: Prediction[] = L
  ? [
      ...(L.predictions?.open_list ?? []).map((o: any) => ({
        id: o.id, question: o.question ?? o.id, locked: !!o.locked,
        settle_date: o.settle_date ?? '—', status: 'open' as const,
      })),
      ...(L.predictions?.settled_list ?? []).map((s: any) => ({
        id: s.id, question: s.id, locked: true, settle_date: '—',
        status: 'settled' as const,
        result: s.outcome === 1 ? '判对了' : s.outcome === 0 ? '判错了' : '—',
      })),
    ]
  : mock.predictions

// ── 三源加息概率 ──
const mo = L?.predictions?.market_odds
export const rateProbabilities = mo
  ? [
      { source: '期货算出来的(ZQ)', prob: Math.round((mo.zq_auto?.value ?? 0) * 100), color: '#5b9eb8' },
      { source: 'CME官网读的', prob: Math.round((mo.cme_manual?.value ?? 0) * 100), color: '#6bb89a' },
      { source: 'Polymarket押注', prob: Math.round((mo.polymarket?.value ?? 0) * 100), color: '#d4a848' },
    ].filter(r => r.prob > 0)
  : mock.rateProbabilities

// ── 官方消息流 ──
const rel = (iso?: string) => {
  if (!iso) return ''
  const h = (Date.now() - new Date(iso).getTime()) / 36e5
  return h < 1 ? `${Math.round(h * 60)}分钟前` : h < 48 ? `${Math.round(h)}小时前` : `${Math.round(h / 24)}天前`
}
export const news: NewsItem[] = L
  ? (L.news ?? []).slice(0, 20).map((n: any, i: number) => ({
      id: `n${i}`, title: n.title, source: n.source,
      chain_tags: n.tags ?? [], time: rel(n.published),
    }))
  : mock.news

// ── 日历 ──
export const calEvents: CalEvent[] = L
  ? (L.calendar ?? []).map((c: any) => ({
      date: c.date, event: c.event.replace(/★/g, ''),
      importance: (Math.min(3, Math.max(1, (c.event.match(/★/g) ?? []).length + 1))) as 1 | 2 | 3,
      watch_for: c.watch ?? '',
    }))
  : mock.calEvents

// ── SPX K线 ──
export function genSPX(): OHLC[] {
  if (L?.spx_ohlc?.length)
    return L.spx_ohlc.map((r: any) => ({ date: r[0], open: r[1], high: r[2], low: r[3], close: r[4] }))
  return mock.genSPX()
}

// ── GEX ──
export const gexData: GexBar[] = L?.gex?.profile?.length
  ? (() => {
      const spot = L.gex.spot
      return L.gex.profile
        .filter((p: any) => Math.abs(p[0] - spot) / spot <= 0.035)
        .map((p: any) => ({ strike: p[0], call_gex: p[1], put_gex: p[2] }))
    })()
  : mock.gexData
export const gexMeta = L?.gex ?? null

// ── 拍卖 ──
const TERM_CN: Record<string, string> = {
  '30-Year': '30年', '29-Year': '30年(续发)', '20-Year': '20年', '19-Year': '20年(续发)',
  '10-Year': '10年', '9-Year': '10年(续发)', '7-Year': '7年', '5-Year': '5年', '4-Year': '5年(续发)',
  '3-Year': '3年', '2-Year': '2年', '1-Year': '2年(续发)',
}
export const auctions: AuctionRow[] = L
  ? (L.auctions ?? []).slice(0, 6).map((a: any) => {
      const tail = a.tail_bp ?? a.tail_bp_synthetic ?? 0
      return {
        term: TERM_CN[a.term] ?? a.term, date: a.auction_date,
        size: `$${Math.round((a.offering_bn ?? 0) * 10)}亿`,
        bid_cover: a.bid_to_cover, indirect: a.indirect_pct ?? 0, tail,
        // 与规则引擎T1对齐：<2.2触发恶化 / >2.4证伪(=健康)
        result: a.bid_to_cover >= 2.4 ? 'good' : a.bid_to_cover >= 2.2 ? 'ok' : 'weak',
      }
    })
  : mock.auctions

// ── 警报规则 ──
const RULE_STATUS: Record<string, AlertRule['status']> = {
  fired: 'fire', fired_muted: 'muted', not_fired: 'ok', skipped: 'skip', manual: 'manual',
}
// 规则读数里的变量名 → 人话（避免 indirect_falling_3=false 这种裸变量漏到界面）
const VAR_LABELS: Record<string, string> = {
  indirect_falling_3: '海外间接投标连降3场', long_indirect_pct: '长债海外占比',
  long_btc: '长债认购倍数', long_tail_bp: '长债尾差', indirect_pct: '海外占比',
  sahm_rule: '衰退报警器', taylor_gap: '泰勒缺口', icsa_4wk_chg_pct: '初请4周环比',
  curve_10y2y: '利率曲线10Y-2Y', curve_10y2y_prev_60d_min: '曲线前60日最低',
  us30y: '30年利率', us20y: '20年利率', us10y: '10年利率', tips10y: '真实利率',
  breakeven10: '物价预期', avg_rate: '政府平均付息率', sofr: '隔夜利率SOFR', iorb: '准备金利率',
  brent: '油价(布伦特)', gold: '黄金', silver: '白银', usdjpy: '日元USDJPY', vix: '恐慌指数VIX',
  vix3m: '3月VIX', move: '债市波动MOVE', dxy: '美元指数', spx: '美股SPX',
  fedwatch_sep_hike: '9月加息概率', cot_gold_pctile: '黄金大户仓位分位',
  gex_flip_dist_pct: '距gamma翻转', gex_callwall_dist_pct: '距call墙', gex_putwall_dist_pct: '距put墙',
  tic_japan_chg: '日本增减持', tic_uk_chg: '英国增减持', tic_china_chg: '中国增减持',
  any_stale: '有数据过期', repo_ops: 'SRF回购用量', fima_weekly_usd: 'FIMA用量',
}
// 单个 变量=值 → "标签：值"；布尔转是/否，概率(0-1)转百分比
function humanReading(k: string, v: any): string {
  const label = VAR_LABELS[k] ?? k
  let val: string
  if (v === true) val = '是'
  else if (v === false) val = '否'
  else if (k === 'fedwatch_sep_hike' && typeof v === 'number') val = `${Math.round(v * 100)}%`
  else if (typeof v === 'number') val = String(Math.round(v * 100) / 100)
  else val = String(v)
  return `${label}：${val}`
}
export const alertRules: AlertRule[] = L
  ? (L.rules ?? []).map((r: any) => ({
      id: r.id, name: (isEN && r.name_en) ? r.name_en : r.name,
      status: RULE_STATUS[r.status] ?? 'ok',
      triggered: Object.entries(r.inputs ?? {}).slice(0, 3).map(([k, v]) => humanReading(k, v)).join(' · ') || (r.reason ?? '—'),
      cause: r.chain ?? '', invalidation: r.falsify || '—',
    }))
  : mock.alertRules

// ── 数据体检 ──
export const dataSources: DataSource[] = L
  ? (L.metrics ?? []).map((m: any) => ({
      name: `${(m.source ?? '').split(':')[0]} - ${m.label}`,
      status: m.stale ? 'stale' : 'ok',
      last_updated: m.as_of ?? '—',
      reason: m.stale ? m.stale_reason : undefined,
    }))
  : mock.dataSources

// ── 走势图 ──
function joined(s1: any[], s2: any[], f: (a: number, b: number) => number) {
  const m2 = new Map((s2 ?? []).map((p: any) => [p[0], p[1]]))
  return (s1 ?? []).filter((p: any) => m2.has(p[0])).map((p: any) => ({ date: p[0], v1: p[1], v2: m2.get(p[0])!, calc: f(p[1], m2.get(p[0])!) }))
}
export const trendRealRate = L?.series?.tips10y
  ? joined(L.series.tips10y, L.series.gold, (a) => a).map(r => ({ date: r.date, real_rate: r.v1, gold: Math.round(r.v2) }))
  : mock.trendRealRate
export const trend30Y = L?.series?.us30y
  ? L.series.us30y.map((p: any) => ({ date: p[0], rate: p[1] }))
  : mock.trend30Y
export const trendSPXGold = L?.series?.spx
  ? joined(L.series.spx, L.series.gold, (a, b) => +(a / b).toFixed(4)).map(r => ({ date: r.date, ratio: r.calc }))
  : mock.trendSPXGold
// 10Y-2Y曲线时序（R1解除倒挂规则的可视化）
export const trendCurve: { date: string; v: number }[] =
  (L?.series?.curve_10y2y ?? []).map((p: any) => ({ date: p[0], v: p[1] }))
// 黄金大户净多单52周（真数据，替换掉Math.sin假曲线）
export const trendCotGold: { date: string; net: number }[] =
  (L?.series?.cot_gold ?? []).map((p: any) => ({ date: p[0], net: p[1] }))
// 泰勒缺口 × 黄金（月度对齐；C路径的可视化证据链，r*=0.75口径）
export const trendTaylorGold: { date: string; taylor: number; gold: number | null }[] = (() => {
  const tay: any[] = L?.series?.taylor_gap ?? []
  if (!tay.length) return []
  const goldByMonth: Record<string, number> = {}
  for (const [d, v] of (L?.series?.gold ?? [])) goldByMonth[String(d).slice(0, 7)] = v
  return tay.map(([d, v]: any) => ({
    date: String(d).slice(0, 7), taylor: v, gold: goldByMonth[String(d).slice(0, 7)] ?? null,
  }))
})()
export const asOfTaylor: string = (L?.series?.taylor_gap ?? []).slice(-1)[0]?.[0] ?? '—'
export const asOfCurve: string = (L?.series?.curve_10y2y ?? []).slice(-1)[0]?.[0] ?? '—'

// ── 引擎页：接线图节点的实时读数（整合我们分析出来的活数据） ──
const curVal = (k: string): number | null => byKey[k]?.value ?? null
const curAsOf = (k: string): string => byKey[k]?.as_of ?? '—'
export const engineLive = {
  // 常规周期引擎
  sahm: curVal('sahm_rule'),                 // 衰退报警器
  sahmAsOf: curAsOf('sahm_rule'),
  taylor: (L?.series?.taylor_gap ?? []).slice(-1)[0]?.[1] ?? null,  // 泰勒缺口(桥)
  taylorAsOf: (L?.series?.taylor_gap ?? []).slice(-1)[0]?.[0] ?? '—',
  us30y: curVal('us30y'),                    // 长端利率
  usdjpy: curVal('usdjpy'),                  // 汇率(利率平价)
  tips10y: curVal('tips10y'),                // 实际利率(费雪/黄金锚)
  // 债务动力学引擎
  longBtc: (L?.auctions ?? [])[0]?.bid_to_cover ?? null,   // 拍卖需求
  avgRate: curVal('avg_rate'),               // r (r vs g)
  gold: curVal('gold'),                      // 黄金支撑
  brent: curVal('brent'),                    // 油价
  generatedAt: L?.generated_at?.slice(0, 10) ?? '—',
}

// ── TIC三国 + 当前剧本 ──
export const ticLive = L?.tic?.length
  ? {
      as_of: L.tic[0].as_of?.slice(0, 7) ?? '—',
      rows: L.tic.map((x: any) => ({
        country: x.country,
        sub: `$${(x.holdings_bn / 1000).toFixed(2)}T ${x.chg_bn < 0 ? '↓' : '↑'}`,
        chg: x.chg_bn,
      })),
    }
  : null
export const regimeLive = L?.regime
  ? {
      name: L.regime.name, met: L.regime.met, total: L.regime.total,
      conds: (L.regime.detail ?? []).map((d: any) => ({
        label: d.cond, value: d.value != null ? fmt(d.value) : '—', met: !!d.met,
      })),
    }
  : null

export const genAt: string = L?.generated_at?.slice(0, 10) ?? '—'
export const asOfMarket: string = byKey['spx']?.as_of ?? genAt
export const asOfTic: string = L?.tic?.[0]?.as_of ?? '—'
export const asOfCot: string = byKey['cot_gold']?.as_of ?? '—'
export const asOfAuction: string = L?.auctions?.[0]?.auction_date ?? '—'
export const gexIsPositive: boolean = (L?.gex?.net_gex_bn ?? 1) >= 0
export const gexSpot: number | null = L?.gex?.spot ?? null
export const gexFlip: number | null = L?.gex?.flip ?? null
export const gexNetBn: number | null = L?.gex?.net_gex_bn ?? null
export const gexCallWall: number | null = L?.gex?.call_wall ?? null
export const gexPutWall: number | null = L?.gex?.put_wall ?? null
// 墙位每日轨迹（2026-08-27起自建存档，逐日生长）
export const gexHistory: { date: string; flip: number | null; call_wall: number | null; put_wall: number | null; net_gex_bn: number | null }[] =
  L?.gex_history ?? []
