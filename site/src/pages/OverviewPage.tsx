import { useState, useEffect } from 'react'
import Globe from '../components/Globe'
import Sparkline from '../components/Sparkline'
import { fetchLiveQuotes, diverges, TRADING_ORDER } from '../data/liveQuote'
import type { LiveQuote } from '../data/liveQuote'
import { snapshots, alerts, alertsNoBands, radarBands, ticLive, regimeLive, backendQuotes } from '../data/live'
import type { RadarBand } from '../data/live'
import { t as tr, isEN } from '../i18n'

const STATUS_COLOR: Record<string, string> = {
  breached: 'var(--st-fire-text)',
  warning:  'var(--st-warn-text)',
  ok:       'var(--st-ok-text)',
}
const STATUS_DOT: Record<string, string> = {
  breached: 'var(--st-fire)',
  warning:  'var(--st-warn)',
  ok:       'var(--st-ok)',
}

// ── 双边警戒带：一条带子两个出口，通向两条不同推理链 ──
function BandBar({ b }: { b: RadarBand }) {
  const pos = Math.max(0, Math.min(1, b.position)) * 100
  const danger = b.status === 'breached_lo' || b.status === 'breached_hi'
  const near = b.status === 'near'
  const fmtV = (v: number) =>
    b.key === 'fedwatch_sep_hike' ? `${(v * 100).toFixed(0)}%`
      : v >= 1000 ? Math.round(v).toLocaleString('en-US') : v.toFixed(1)
  const statusText = b.status === 'breached_hi' ? (isEN ? 'above band' : '已破上界')
    : b.status === 'breached_lo' ? (isEN ? 'below band' : '已破下界')
    : b.dist_hi_pct <= b.dist_lo_pct
      ? (isEN ? `${b.dist_hi_pct.toFixed(1)}% to upper` : `离上界差${b.dist_hi_pct.toFixed(1)}%`)
      : (isEN ? `${b.dist_lo_pct.toFixed(1)}% to lower` : `离下界差${b.dist_lo_pct.toFixed(1)}%`)
  const mainColor = danger ? 'var(--st-fire-text)' : near ? 'var(--st-warn-text)' : 'var(--st-ok-text)'
  return (
    <div className="neu-sm p-4">
      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>{b.label}</span>
        <span className="font-num text-sm font-bold" style={{ color: mainColor }}>
          {fmtV(b.value)}{b.unit ? ` ${b.unit}` : ''} · {statusText}
        </span>
      </div>
      <div className="relative my-2.5" style={{ height: 14 }}>
        <div className="absolute inset-0 rounded-full" style={{ backgroundColor: 'var(--st-ok-bg)' }} />
        <div className="absolute left-0 top-0 bottom-0 rounded-l-full" style={{ width: '10%', backgroundColor: b.status === 'breached_lo' ? 'var(--st-fire)' : 'var(--st-warn-bg)' }} />
        <div className="absolute right-0 top-0 bottom-0 rounded-r-full" style={{ width: '10%', backgroundColor: b.status === 'breached_hi' ? 'var(--st-fire)' : 'var(--st-warn-bg)' }} />
        <div
          className="absolute rounded-full"
          style={{
            width: 18, height: 18, top: -2, left: `calc(${pos}% - 9px)`,
            backgroundColor: 'var(--card)',
            border: `3px solid ${danger ? 'var(--st-fire-text)' : near ? 'var(--st-warn-text)' : 'var(--st-ok)'}`,
            boxShadow: '2px 2px 5px var(--shadow-dark)',
          }}
        />
      </div>
      <div className="flex justify-between gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>{b.lo_note}</span>
        <span className="text-right">{b.hi_note}</span>
      </div>
      <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
        {isEN ? 'basis: ' : '依据：'}{b.origin}
      </div>
    </div>
  )
}

export default function OverviewPage({ onGlobeClick }: { onGlobeClick?: () => void }) {
  const [hoveredAlert, setHoveredAlert] = useState<string | null>(null)
  const [showStandard, setShowStandard] = useState(false)

  // 实时参考价：进页面拉一次，之后每60秒刷新。拿不到就静默用官方值。
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
    // 切回标签页时立刻补一次（后台标签的定时器会被浏览器降频）
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

  const sorted = [...alertsNoBands].sort((a, b) => {
    const order = { breached: 0, warning: 1, ok: 2 }
    return order[a.status] - order[b.status]
  })
  const nWatch = alertsNoBands.length + radarBands.length

  // 浏览器端优先；取不到的标的（如国内无源的BTC）回落到后台20分钟通道
  const tradeRows = TRADING_ORDER.map(t => {
    const q = live[t.key]
    if (q) return { ...t, q, live: true }
    const b = backendQuotes[t.key]
    return b ? { ...t, q: { value: b.value, chg_1d_pct: b.chg_1d_pct } as LiveQuote, live: false }
             : { ...t, q: undefined, live: false }
  }).filter(x => x.q)

  return (
    <div className="space-y-6">

      {/* ── 盘口：她实际交易的标的（期货/现货/CFD口径，非指数）──── */}
      {tradeRows.length > 0 && (
        <section>
          <h2 className="text-base font-bold mb-2 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text)' }}>
            {isEN ? 'What you trade' : '盘口'}
            <span className="badge" style={{ backgroundColor: 'var(--st-ok-bg)', color: 'var(--st-ok-text)' }}>
              <span className="dot pulse-dot" style={{ backgroundColor: 'var(--st-ok)' }} />
              {isEN ? `live · ${liveAgo}` : `实时 · ${liveAgo}`}
            </span>
          </h2>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {tradeRows.map(({ key, label, note, dp, q }) => {
              const up = (q!.chg_1d_pct ?? 0) >= 0
              return (
                <div key={key} className="neu-sm px-3 py-2.5">
                  <div className="flex items-baseline justify-between gap-1">
                    <span className="text-xs font-medium notranslate" style={{ color: 'var(--text-muted)' }}>
                      {label}
                    </span>
                    {q!.chg_1d_pct != null && (
                      <span className="font-num" style={{
                        fontSize: 11,
                        color: up ? 'var(--green)' : 'var(--red)',
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
      )}

      {/* ── Hero: Globe + Regime chip ────────────────── */}
      <div className="flex flex-col md:flex-row gap-5 items-start">
        {/* Globe */}
        <div className="neu p-4 flex-shrink-0 flex flex-col items-center gap-3">
          <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {tr('tic_title')}
          </div>
          <Globe tic={ticLive?.rows} asOf={ticLive?.as_of} onClick={onGlobeClick} />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tr('tic_hint')}
          </div>
        </div>

        {/* Right column: regime + conditions */}
        <div className="flex-1 space-y-4">
          {/* Regime chip */}
          <div className="neu p-5">
            <div className="flex items-center gap-3 mb-4">
              <div>
                <div className="font-bold text-base" style={{ color: 'var(--text)' }}>
                  {regimeLive ? `${regimeLive.name} · ${tr('regime_scenario')}` : tr('regime_fallback')}
                </div>
                <div
                  className="font-num text-xs mt-1 px-3 py-0.5 rounded-full inline-block"
                  style={{
                    backgroundColor: 'var(--st-warn-bg)',
                    color: 'var(--st-warn-text)',
                  }}
                >
                  {regimeLive ? `${regimeLive.met} / ${regimeLive.total} ${tr('conds_met')}` : '— / —'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(regimeLive?.conds ?? []).map((c, i) => (
                <div
                  key={i}
                  className="neu-inset-sm flex items-center gap-3 px-4 py-3"
                >
                  <span className="dot" style={{ backgroundColor: c.met ? 'var(--st-fire)' : 'var(--st-mute)' }} />
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {c.label}
                    </div>
                  </div>
                  <div
                    className="font-num text-sm font-bold"
                    style={{ color: c.met ? 'var(--st-fire-text)' : 'var(--text-muted)' }}
                  >
                    {c.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Quick numbers */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: tr('active_alerts'), value: String(alerts.filter(a => a.status === 'breached').length), color: 'var(--st-fire-text)', dot: 'var(--st-fire)' },
              { label: tr('near_threshold'), value: String(alerts.filter(a => a.status === 'warning').length), color: 'var(--st-warn-text)', dot: 'var(--st-warn)' },
              { label: tr('status_ok'), value: String(alerts.filter(a => a.status === 'ok').length), color: 'var(--st-ok-text)', dot: 'var(--st-ok)' },
            ].map(s => (
              <div key={s.label} className="neu p-3 text-center">
                <div className="flex justify-center mb-1.5"><span className="dot" style={{ backgroundColor: s.dot }} /></div>
                <div className="font-num font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Radar ────────────────────────────────────── */}
      <section>
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <h2 className="text-base font-bold" style={{ color: 'var(--text)' }}>
            {tr('radar_title')}
            <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>（{nWatch} {tr('radar_n')}）</span>
          </h2>
          <button
            onClick={() => setShowStandard(v => !v)}
            className="neu-sm px-3 py-1 text-xs ml-auto"
            style={{ color: 'var(--accent)' }}
          >
            {isEN ? 'How are lines set?' : '警戒线怎么定的？'} {showStandard ? '▲' : '▼'}
          </button>
        </div>

        {/* 标准说明卡（回答"阈值有没有标准"） */}
        {showStandard && (
          <div className="neu-inset p-4 mb-4 text-xs space-y-2" style={{ color: 'var(--text)' }}>
            <div className="font-bold">{isEN ? 'Every line has a documented basis, one of four types:' : '每条线都有出处（标在各卡片底部），共四类：'}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {isEN
                ? 'Event level (an actual past trigger, e.g. JPY 163 = Jul-31 intervention) · Scenario band (from a dated report) · Mechanism (a math flip point, e.g. avg rate 4% = r overtaking g) · Statistical (e.g. 90th percentile positioning).'
                : '① 历史事件位——真实发生过的触发价（如日元163=7-31官方干预位）；② 报告情景区间——来自注明日期的分析报告；③ 机制阈值——数学上的翻转点（如平均付息率4%=利息增速追上收入增速）；④ 统计分位——如大户仓位90分位。'}
            </div>
            <div className="font-bold pt-1">{isEN ? 'Why upper and lower bounds can never fire together:' : '为什么上界下界不可能同时触发：'}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {isEN
                ? 'A band is one corridor with two exits — each exit leads to a different reasoning chain. Price can only leave through one side.'
                : '双边线不是两个警报，是一条带子的两个出口，两端通向不同的推理链——价格永远只能从一边出去。'}
            </div>
            <div className="font-bold pt-1">{isEN ? 'Combination alarms:' : '组合警报（多条同亮才算数的）：'}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {isEN
                ? 'Financial-repression signal = inflation expectations >2.8% + 30Y >5.2% + market not pricing hikes, all at once (highest severity). Foreign-official retreat = Japan, UK and China all cutting Treasury holdings in the same month. All other combination logic lives in the six reasoning chains (see the reasoning tab).'
                : '金融抑制信号＝通胀预期>2.8%＋30年利率>5.2%＋市场不预期加息，三条同亮（最高级警报）；官方买方退潮＝日英中同月同时减持美债。其余组合语义由六条推理链承担（见推理页）。'}
            </div>
            <div className="font-bold pt-1">{isEN ? 'Severity ladder:' : '警报分四级：'}</div>
            <div style={{ color: 'var(--text-muted)' }}>
              {isEN
                ? 'record → watch → push to Telegram → push and pin.'
                : '记录 → 留意 → 推送TG → 推送并置顶。'}
            </div>
          </div>
        )}

        {/* 双边警戒带 */}
        {radarBands.length > 0 && (
          <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {radarBands.map(b => <BandBar key={b.id} b={b} />)}
          </div>
        )}

        {/* 单边警戒线 */}
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))' }}
        >
          {sorted.map(a => (
            <div
              key={a.id}
              className="neu-sm p-3 relative cursor-help transition-transform hover:scale-[1.02]"
              onMouseEnter={() => setHoveredAlert(a.id)}
              onMouseLeave={() => setHoveredAlert(null)}
            >
              {/* Status badge */}
              <div className="flex items-center gap-1.5 mb-2">
                <span className="dot" style={{ backgroundColor: STATUS_DOT[a.status] }} />
                <span
                  className="text-xs font-medium"
                  style={{ color: STATUS_COLOR[a.status] }}
                >
                  {a.status === 'breached' ? tr('breached') : a.status === 'warning' ? tr('warning_w') : tr('ok_w')}
                </span>
              </div>

              {/* Name */}
              <div className="text-xs font-medium leading-tight mb-2" style={{ color: 'var(--text)' }}>
                {a.name}
              </div>

              {/* Values */}
              <div className="flex items-end justify-between">
                <div>
                  <div className="font-num text-sm font-bold" style={{ color: 'var(--text)' }}>
                    {a.current}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    线: {a.threshold}
                  </div>
                </div>
                {a.distance_pct < 100 && (
                  <div
                    className="font-num text-xs font-bold px-2 py-0.5 rounded-lg"
                    style={{
                      backgroundColor: 'var(--bg2)',
                      color: STATUS_COLOR[a.status],
                      boxShadow: 'inset 2px 2px 4px var(--shadow-dark)',
                    }}
                  >
                    {tr('gap')}{Math.abs(a.distance_pct).toFixed(1)}%
                  </div>
                )}
              </div>

              {/* 来源标签 */}
              {a.origin && (
                <div className="text-xs mt-2 leading-tight" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
                  {a.origin}
                </div>
              )}

              {/* Hover tooltip */}
              {hoveredAlert === a.id && (
                <div
                  className="absolute bottom-full left-0 mb-2 px-3 py-2 rounded-xl text-xs z-50 w-48"
                  style={{
                    backgroundColor: 'var(--bg2)',
                    boxShadow: '4px 4px 12px var(--shadow-dark)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                  }}
                >
                  <div className="font-medium mb-1">规则来源</div>
                  <div style={{ color: 'var(--text-muted)' }}>{a.rule_source}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 12 Market Snapshots ──────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2 flex-wrap" style={{ color: 'var(--text)' }}>
          {tr('snapshot_title')}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（as of {snapshots[0]?.as_of ?? '—'}）</span>
          {Object.keys(live).length > 0 && (
            <span className="badge" style={{
              backgroundColor: 'var(--st-ok-bg)', color: 'var(--st-ok-text)',
            }}>
              <span className="dot pulse-dot" style={{ backgroundColor: 'var(--st-ok)' }} />
              {isEN ? `live · ${liveAgo}` : `实时参考价 · ${liveAgo}`}
            </span>
          )}
        </h2>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
        >
          {snapshots.map(s => {
            // 实时参考价（东方财富，仅显示用，不进判定）；与官方值背离则并列不择一
            const q = live[s.key]
            const officialNum = Number(String(s.value).replace(/,/g, ''))
            const conflict = q ? diverges(q.value, officialNum) : false
            const showLive = !!q && !conflict
            const up = showLive && q.chg_1d_pct != null ? q.chg_1d_pct >= 0 : s.change >= 0
            const chg = showLive && q.chg_1d_pct != null ? q.chg_1d_pct : s.change
            const disp = showLive
              ? q.value.toLocaleString('en-US', { maximumFractionDigits: q.value >= 1000 ? 0 : 2 })
              : s.value
            // 时序角色标签：领先=预判 / 同步=确认 / 滞后=勿当预测用（悬停看提示）
            const roleMeta = s.role === 'leading'
              ? { label: tr('role_leading'), tip: tr('role_leading_tip'), color: 'var(--st-ok-text)', bg: 'var(--st-ok-bg)' }
              : s.role === 'coincident'
              ? { label: tr('role_coincident'), tip: tr('role_coincident_tip'), color: 'var(--text-muted)', bg: 'var(--bg2)' }
              : s.role === 'lagging'
              ? { label: tr('role_lagging'), tip: tr('role_lagging_tip'), color: 'var(--st-warn-text)', bg: 'var(--st-warn-bg)' }
              : null
            return (
              <div key={s.key} className="neu-sm p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="text-xs font-medium flex items-center gap-1.5 min-w-0" style={{ color: 'var(--text-muted)' }}>
                    <span className="truncate">{s.label}</span>
                    {roleMeta && (
                      <span
                        className="px-1.5 rounded-full flex-shrink-0 cursor-help"
                        style={{ fontSize: 10, backgroundColor: roleMeta.bg, color: roleMeta.color }}
                        title={roleMeta.tip}
                      >
                        {roleMeta.label}
                      </span>
                    )}
                  </span>
                  <span
                    className="font-num text-xs px-1.5 py-0.5 rounded-lg"
                    style={{
                      backgroundColor: up ? '#6bb89a22' : '#e0787822',
                      color: up ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {up ? '▲' : '▼'} {Math.abs(chg).toFixed(2)}%
                  </span>
                </div>

                <div className="font-num font-bold text-2xl leading-tight flex items-baseline gap-1.5"
                  style={{ color: 'var(--text)' }}>
                  {disp}
                  {s.unit && (
                    <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
                      {s.unit}
                    </span>
                  )}
                  {showLive && (
                    <span className="dot pulse-dot" style={{ backgroundColor: 'var(--st-ok)' }}
                      title={isEN ? 'live reference price' : '实时参考价'} />
                  )}
                </div>

                {/* 两源冲突：并列显示，不静默择一（沿用SOFR双源纪律） */}
                {conflict && q && (
                  <div className="text-xs" style={{ color: 'var(--st-warn-text)' }}>
                    {isEN ? 'live quote differs: ' : '实时源不一致：'}
                    {q.value.toLocaleString('en-US', { maximumFractionDigits: 2 })}
                  </div>
                )}

                <div className="flex items-end justify-between">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div>{showLive ? (isEN ? 'live' : '实时') : s.as_of}</div>
                    <div>{showLive ? (isEN ? 'ref. quote' : '参考报价') : s.source}</div>
                  </div>
                  <div className="neu-inset-sm p-1.5">
                    <Sparkline data={s.spark} positive={up} width={72} height={24} />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
