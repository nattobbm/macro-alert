// 盘中实时参考价（浏览器直连东方财富，约实时~15分钟）
//
// ⚠️ 边界（不可越）：东方财富是二手聚合站。本项目铁律"二手聚合站一律不作为数据源"
// 源自 2026-08-17 事故（二手站回收旧TIC数据 → 方向判断完全相反）。
// 因此本模块产出的价格：
//   ✅ 只用于看板"当前价"显示，让人扫一眼知道现在什么位置
//   ❌ 绝不进 ctx / 规则引擎 / 预测单结算 / 任何判定
// 判定链路仍然只吃官方镜像(yfinance)+官方一手(FRED等)，且必须过新鲜度断言。
//
// 交叉校验：与官方值偏离超过阈值时不静默择一，并列显示两个数（沿用 H2_sofr_conflict 的纪律）。
//
// 为什么选它：实测只有它同时满足 免费 + 允许跨域(CORS) + 国内可达。
// Yahoo/Stooq/新浪/Frankfurter 均被浏览器同源策略挡下（2026-08-31 实测）。

const API = 'https://push2.eastmoney.com/api/qt/ulist.np/get'

// 我们的指标key ← 东方财富 secid。f1 字段给小数位，值需除以 10^f1。
const SECID: Record<string, string> = {
  spx: '100.SPX',
  gold: '101.GC00Y',
  silver: '101.SI00Y',
  usdjpy: '119.USDJPY',
  dxy: '100.UDI',
}

export type LiveQuote = {
  value: number
  chg_1d_pct: number | null
  ts: string          // 该报价自身的时间戳（不是我们抓取的时间）
  name: string
}

/** 拉一次实时参考价。任何失败都返回空对象，调用方继续用官方值。 */
export async function fetchLiveQuotes(timeoutMs = 6000): Promise<Record<string, LiveQuote>> {
  const ids = Object.values(SECID)
  const url = `${API}?fields=f1,f2,f3,f12,f13,f14,f124&secids=${ids.join(',')}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
    if (!r.ok) return {}
    const j = await r.json()
    const bySecid: Record<string, any> = {}
    for (const d of j?.data?.diff ?? []) bySecid[`${d.f13}.${d.f12}`] = d
    const out: Record<string, LiveQuote> = {}
    for (const [key, secid] of Object.entries(SECID)) {
      const d = bySecid[secid]
      if (!d || d.f2 == null || d.f2 === '-') continue
      const dec = typeof d.f1 === 'number' ? d.f1 : 2
      const v = Number(d.f2) / Math.pow(10, dec)
      if (!isFinite(v) || v <= 0) continue
      out[key] = {
        value: v,
        chg_1d_pct: typeof d.f3 === 'number' ? d.f3 / 100 : null,
        ts: d.f124 ? new Date(d.f124 * 1000).toISOString() : '',
        name: d.f14 ?? key,
      }
    }
    return out
  } catch {
    return {}          // 海外网络慢/被挡，静默降级
  } finally {
    clearTimeout(timer)
  }
}

/** 与官方值的偏离（%）。超阈值时调用方应并列显示两个数，不择一。 */
export const DIVERGE_PCT = 0.5

export function diverges(live: number, official: number | null | undefined): boolean {
  if (official == null || !isFinite(official) || official === 0) return false
  return Math.abs(live / official - 1) * 100 > DIVERGE_PCT
}
