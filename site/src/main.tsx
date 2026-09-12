import { createRoot } from 'react-dom/client'
import './index.css'

// [槽位, quotes.json 的 key, 源的人话名（与 monitor.py 的 _fedwatch_source 一致）]
// CME 那条是人工读数，没有轻量通道，只参与"谁更新"的比较。
const HIKE_SLOTS: Array<[string, string, string]> = [
  ['cme_manual', '', 'CME人工读数'],
  ['zq_auto', 'fedwatch_zq_sep', 'ZQ期货自算'],
  ['polymarket', 'polymarket_sep_hike', 'Polymarket押注'],
  // Kalshi 2026-09-12 撤下：其数据条款禁止未经书面授权公开展示（见 fetchers/kalshi.py 头注）
]

// 2026-09-11 加。latest.json 每天只跑两次，而加息概率在数据日一天能动 20 个百分点
// （9-11 CPI 当天 73.8% → 92.3%），网站隔了 4.5 小时才反映。轻量通道现在也刷这个数，
// 这里把更新的值盖到它出现的四个地方，避免同一个数在页面上有两种写法。
// **只盖"显示的那个数"**：链条热度、判据、推送都仍是完整跑的产物，不在这里重算。
function applyFreshHikeOdds(full: any, q: Record<string, any>) {
  const mo = full?.predictions?.market_odds
  if (!mo) return
  for (const [slot, qk] of HIKE_SLOTS) {
    if (!qk) continue
    const fresh = q[qk]
    const cur = mo[slot]
    if (fresh?.value == null || !fresh.as_of) continue
    if (!cur || cur.as_of == null || fresh.as_of >= cur.as_of) {
      mo[slot] = { ...(cur ?? {}), value: fresh.value, as_of: fresh.as_of, stale: false }
    }
  }
  // 选源规则和后端一字不差（monitor.py build_ctx 里那段）：
  // 3 天保质期这道闸照留，闸内按固定优先级 ZQ → Polymarket → CME 取。
  // **不能按 as_of 比大小**：ZQ 的 as_of 是期货最后交易日的结算日，Polymarket 的是此刻，
  // 两种含义不同的时间戳比大小，会让每个 UTC 零点之后自动切到 Polymarket，
  // 首页数字凭空跳十几个百分点（9-12 02:19Z 实测 92.3% → 78.5%）。
  const today = new Date().toISOString().slice(0, 10)
  const ageDays = (d: string) =>
    Math.floor((Date.parse(today + 'T00:00:00Z') - Date.parse(d + 'T00:00:00Z')) / 864e5)
  // 主源定死 ZQ，备源 CME 人工，**Polymarket 只做交叉校验、永不顶替**。
  // 这是后端 monitor.py 2026-09-10 那次改动的规则，前端必须一字不差地跟，
  // 否则同一个数会在"完整跑"和"盘中刷新"之间来回换源。
  // 他们量化过：73 次两源同时有值，ZQ 100% 高于 Polymarket，中位差 13.1pp；
  // 按 as_of 选源在 73 次里切了 12 次，每次跳 12.9pp，其中 1 次跨过 65% 阈值
  // 被当成"市场重定价"推给了用户——行情根本没动。
  const PRIO = ['zq_auto', 'cme_manual']
  let best: { v: number; as_of: string; label: string } | null = null
  for (const slot of PRIO) {
    const c = mo[slot]
    if (!c || c.value == null || !c.as_of || c.stale) continue
    if (ageDays(c.as_of) > 3) continue
    const label = (HIKE_SLOTS.find(s => s[0] === slot) ?? [, , slot])[2] as string
    best = { v: c.value, as_of: c.as_of, label }
    break
  }
  if (!best) return

  const reg = full.regime
  if (reg?.detail) {
    for (const d of reg.detail) {
      if (d.key !== 'fedwatch_sep_hike') continue
      d.value = best.v
      d.disp = `${(best.v * 100).toFixed(1)}%`
      d.known = true
      d.met = best.v < 0.4            // 条件原文就是「低于40%」
    }
    reg.met = reg.detail.filter((d: any) => d.met).length
    reg.unknown = reg.detail.filter((d: any) => d.known === false).length
    reg.source_note = `${best.label} as_of=${best.as_of}`
  }

  // 雷达带子：数值跟着更新；状态只在真的破带时重算。
  // 带内 in_band↔near 的判定后端带迟滞（防一天翻两次），前端复刻不了，所以跟着后端走。
  for (const b of full.radar_bands ?? []) {
    if (b.key !== 'fedwatch_sep_hike' || b.lo == null || b.hi == null) continue
    b.value = best.v
    b.position = Math.max(-0.15, Math.min(1.15, (best.v - b.lo) / (b.hi - b.lo)))
    b.dist_lo_pct = +(((best.v - b.lo) / b.lo) * 100).toFixed(2)
    b.dist_hi_pct = +(((b.hi - best.v) / b.hi) * 100).toFixed(2)
    if (best.v < b.lo) b.status = 'breached_lo'
    else if (best.v > b.hi) b.status = 'breached_hi'
    else if (b.status === 'breached_lo' || b.status === 'breached_hi') b.status = 'near'
  }

  // 链条节点：同一个数不能在页面上出现两种写法
  for (const c of full.knowledge?.chains ?? []) {
    for (const n of c.nodes ?? []) {
      if (n.metric !== 'fedwatch_sep_hike' || n.threshold == null) continue
      n.value = best.v
      const denom = Math.abs(n.threshold) || 100
      const dist = n.direction === 'above'
        ? (n.threshold - best.v) / denom
        : (best.v - n.threshold) / denom
      n.dist_pct = +(dist * 100).toFixed(2)
      if (dist < 0) n.status = 'crossed'
      else if (n.status === 'crossed') n.status = dist < 0.05 ? 'near' : 'quiet'
    }
  }
}

async function boot() {
  // 两份数据并行取：latest.json 是完整快照(每天2次)，
  // quotes.json 是盘中轻量行情(每20分钟)，谁的 as_of 新用谁的价。
  const [full, quotes] = await Promise.all([
    fetch('./data/latest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('./data/quotes.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])
  if (full) {
    if (quotes?.quotes) {
      full.quotes = quotes.quotes
      full.quotes_at = quotes.generated_at
      // 覆盖 metrics 里的行情项（只在 quotes 更新时覆盖，宏观数据不动）
      for (const m of full.metrics ?? []) {
        const q = quotes.quotes[m.key]
        if (q && q.value != null && (!m.as_of || q.as_of >= m.as_of)) {
          m.value = q.value
          m.as_of = q.as_of
          if (q.chg_1d_pct != null) m.chg_1d_pct = q.chg_1d_pct
          m.intraday = true
        }
      }
      // 加息概率不在 metrics 里——它散在剧本卡 / 雷达带子 / 三源对照 / 链条节点四处，
      // 得单独盖一遍，否则同一个数会在页面上出现两种写法。
      applyFreshHikeOdds(full, quotes.quotes)
    }
    ;(globalThis as any).__LATEST = full
  }
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(<App />)
}
boot()
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
