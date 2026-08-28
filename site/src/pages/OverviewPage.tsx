import { useState } from 'react'
import Globe from '../components/Globe'
import Sparkline from '../components/Sparkline'
import { snapshots, alerts, ticLive, regimeLive } from '../data/live'
import { t as tr, isEN } from '../i18n'

const STATUS_ICON = { breached: '🔥', warning: '⚠️', ok: '🟢' }
const STATUS_COLOR: Record<string, string> = {
  breached: 'var(--red)',
  warning:  'var(--yellow)',
  ok:       'var(--green)',
}

export default function OverviewPage() {
  const [hoveredAlert, setHoveredAlert] = useState<string | null>(null)

  const sorted = [...alerts].sort((a, b) => {
    const order = { breached: 0, warning: 1, ok: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <div className="space-y-6">

      {/* ── Hero: Globe + Regime chip ────────────────── */}
      <div className="flex flex-col md:flex-row gap-5 items-start">
        {/* Globe */}
        <div className="neu p-4 flex-shrink-0 flex flex-col items-center gap-3">
          <div className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
            {tr('tic_title')}
          </div>
          <Globe tic={ticLive?.rows} asOf={ticLive?.as_of} />
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {tr('tic_hint')}
          </div>
        </div>

        {/* Right column: regime + conditions */}
        <div className="flex-1 space-y-4">
          {/* Regime chip */}
          <div className="neu p-5">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">⚠️</span>
              <div>
                <div className="font-bold text-base" style={{ color: 'var(--text)' }}>
                  {regimeLive ? `${regimeLive.name} · ${tr('regime_scenario')}` : tr('regime_fallback')}
                </div>
                <div
                  className="font-num text-xs mt-0.5 px-3 py-0.5 rounded-full inline-block"
                  style={{
                    backgroundColor: 'var(--yellow)',
                    color: '#fff',
                    boxShadow: '2px 2px 5px var(--shadow-dark)',
                  }}
                >
                  {regimeLive ? `${regimeLive.met} / ${regimeLive.total} ${tr('conds_met')}` : '1 / 3'}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {(regimeLive
                ? regimeLive.conds.map(c => ({ label: c.label, value: c.value, threshold: '', met: c.met, term: '' }))
                : [
                { label: '债务利息 / 财政收入', value: '13.1%', threshold: '> 12%', met: true,  term: 'Interest/Revenue Ratio' },
                { label: '真实利率', value: '2.07%', threshold: '< 0% (理想)', met: false, term: 'Real Yield' },
                { label: '联储直接购债', value: '不在QE期间', threshold: '持续净购买',    met: false, term: 'Quantitative Easing' },
              ]).map((c, i) => (
                <div
                  key={i}
                  className="neu-inset-sm flex items-center gap-3 px-4 py-3"
                  title={c.term}
                >
                  <span className="text-lg">{c.met ? '🔥' : '⭕'}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                      {c.label}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      目标: {c.threshold}
                    </div>
                  </div>
                  <div
                    className="font-num text-sm font-bold"
                    style={{ color: c.met ? 'var(--red)' : 'var(--text-muted)' }}
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
              { label: tr('active_alerts'), value: String(alerts.filter(a => a.status === 'breached').length), color: 'var(--red)', icon: '🔥' },
              { label: tr('near_threshold'), value: String(alerts.filter(a => a.status === 'warning').length), color: 'var(--yellow)', icon: '⚠️' },
              { label: tr('status_ok'), value: String(alerts.filter(a => a.status === 'ok').length), color: 'var(--green)', icon: '🟢' },
            ].map(s => (
              <div key={s.label} className="neu p-3 text-center">
                <div className="text-xl mb-1">{s.icon}</div>
                <div className="font-num font-bold text-2xl" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 18 Alert Cards ───────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🎯</span> {tr('radar_title')}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（18 {tr('radar_n')}）</span>
        </h2>
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
                <span className="text-base">{STATUS_ICON[a.status]}</span>
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
                  <div className="font-medium mb-1">📖 规则来源</div>
                  <div style={{ color: 'var(--text-muted)' }}>{a.rule_source}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── 12 Market Snapshots ──────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>📊</span> {tr('snapshot_title')}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（as of {snapshots[0]?.as_of ?? '—'}）</span>
        </h2>
        <div
          className="grid gap-3"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))' }}
        >
          {snapshots.map(s => {
            const up = s.change >= 0
            return (
              <div key={s.key} className="neu-sm p-4 flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                    {s.label}
                  </span>
                  <span
                    className="font-num text-xs px-1.5 py-0.5 rounded-lg"
                    style={{
                      backgroundColor: up ? '#6bb89a22' : '#e0787822',
                      color: up ? 'var(--green)' : 'var(--red)',
                    }}
                  >
                    {up ? '▲' : '▼'} {Math.abs(s.change).toFixed(2)}%
                  </span>
                </div>

                <div className="font-num font-bold text-2xl leading-tight" style={{ color: 'var(--text)' }}>
                  {s.value}
                  {s.unit && (
                    <span className="text-xs font-normal ml-1" style={{ color: 'var(--text-muted)' }}>
                      {s.unit}
                    </span>
                  )}
                </div>

                <div className="flex items-end justify-between">
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    <div>{s.as_of}</div>
                    <div>{s.source}</div>
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
