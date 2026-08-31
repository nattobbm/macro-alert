// 盘口：Momo 实际交易的标的（期货/现货/CFD 口径，不是指数）
//
// 2026-09-01 从总览页移到市场页（Momo：「盘口放市场」）——市场页是交易视图
// （K线/GEX/拍卖），盘口属于那里；总览留给宏观状态。
//
// 边界：所有报价仅供显示，绝不进规则引擎。期货/现货/指数是不同标的，逐个标口径
// ——ES期货与SPX现货差约3点、COMEX黄金与伦敦金现差约50美元，看错标的比看到旧数据更危险。
import { useEffect, useState } from 'react'
import { fetchLiveQuotes, TRADING_ORDER } from '../data/liveQuote'
import type { LiveQuote } from '../data/liveQuote'
import { backendQuotes } from '../data/live'
import { isEN } from '../i18n'

export default function TradingStrip() {
  const [live, setLive] = useState<Record<string, LiveQuote>>({})
  const [liveAt, setLiveAt] = useState<number>(0)

  useEffect(() => {
    let alive = true
    const pull = async () => {
      const q = await fetchLiveQuotes()
      if (alive && Object.keys(q).length) { setLive(q); setLiveAt(Date.now()) }
    }
    pull()
    const id = setInterval(pull, 60_000)
    // 切回标签页时补一次（后台标签的定时器会被浏览器降频）
    const onVis = () => { if (document.visibilityState === 'visible') pull() }
    document.addEventListener('visibilitychange', onVis)
    return () => { alive = false; clearInterval(id); document.removeEventListener('visibilitychange', onVis) }
  }, [])

  const liveAgo = liveAt
    ? (() => {
        const s = Math.round((Date.now() - liveAt) / 1000)
        return s < 90 ? (isEN ? 'just now' : '刚刚') : `${Math.round(s / 60)}${isEN ? 'm ago' : '分钟前'}`
      })()
    : ''

  // 浏览器端优先；取不到的标的（如国内无源的BTC）回落到后台20分钟通道
  const rows = TRADING_ORDER.map(t => {
    const q = live[t.key]
    if (q) return { ...t, q, isLive: true }
    const b = backendQuotes[t.key]
    return b ? { ...t, q: { value: b.value, chg_1d_pct: b.chg_1d_pct } as LiveQuote, isLive: false }
             : { ...t, q: undefined, isLive: false }
  }).filter(x => x.q)

  if (!rows.length) return null

  return (
    <section>
      <h2 className="text-base font-bold mb-2 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text)' }}>
        {isEN ? 'What you trade' : '盘口'}
        {Object.keys(live).length > 0 && (
          <span className="badge" style={{ backgroundColor: 'var(--st-ok-bg)', color: 'var(--st-ok-text)' }}>
            <span className="dot pulse-dot" style={{ backgroundColor: 'var(--st-ok)' }} />
            {isEN ? `live · ${liveAgo}` : `实时 · ${liveAgo}`}
          </span>
        )}
      </h2>
      <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
        {rows.map(({ key, label, note, dp, q }) => {
          const up = (q!.chg_1d_pct ?? 0) >= 0
          return (
            <div key={key} className="neu-sm px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-1">
                <span className="text-xs font-medium notranslate" style={{ color: 'var(--text-muted)' }}>
                  {label}
                </span>
                {q!.chg_1d_pct != null && (
                  <span className="font-num" style={{
                    fontSize: 11, color: up ? 'var(--green)' : 'var(--red)',
                  }}>
                    {up ? '▲' : '▼'}{Math.abs(q!.chg_1d_pct).toFixed(2)}%
                  </span>
                )}
              </div>
              <div className="font-num font-bold text-lg leading-tight notranslate" style={{ color: 'var(--text)' }}>
                {q!.value.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })}
              </div>
              {note && (
                <div style={{ fontSize: 10, color: 'var(--text-muted)', opacity: 0.85 }}>{note}</div>
              )}
            </div>
          )
        })}
      </div>
      <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
        {isEN
          ? 'Live reference quotes for display only — never used in rule evaluation. Futures / spot / index are different instruments; each is labeled.'
          : '实时参考报价，仅供显示，不参与任何规则判定。期货/现货/指数是不同标的，已分别标注口径。'}
      </div>
    </section>
  )
}
