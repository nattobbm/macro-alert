import { useState } from 'react'
import { chains, verdicts, predictions, rateProbabilities, news, calEvents } from '../data/live'
import { t as tr, isEN } from '../i18n'

const STATUS_META = {
  fire:    { icon: '🔥', label: tr('breached'), color: 'var(--red)' },
  warning: { icon: '⚠️', label: tr('warning_w'),  color: 'var(--yellow)' },
  ok:      { icon: '🟢', label: tr('ok_w'),  color: 'var(--green)' },
  fact:    { icon: '📌', label: tr('v_fact'),  color: 'var(--accent)' },
}

const VERDICT_META = {
  true:    { icon: '✅', label: tr('v_true'), color: '#6bb89a' },
  false:   { icon: '❌', label: tr('v_false'), color: '#e07878' },
  pending: { icon: '⏳', label: tr('v_pending'), color: '#d4a848' },
  testing: { icon: '🧪', label: tr('v_testing'), color: '#5b9eb8' },
  fact:    { icon: '📌', label: tr('v_fact'), color: '#88a0b8' },
}

const CHAIN_COLORS = [
  '#5b9eb8', '#6bb89a', '#d4a848', '#e07878', '#a088c0', '#88b888',
]

export default function ReasoningPage() {
  const [expandedChain, setExpandedChain] = useState<string | null>(null)
  const [expandedVerdict, setExpandedVerdict] = useState<string | null>(null)

  const sorted = [...chains].sort((a, b) => b.heat - a.heat)

  return (
    <div className="space-y-6">

      {/* ── Logic Chains ─────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🔗</span> {tr('chains_title')}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（{tr('chains_hint')}）</span>
        </h2>
        <div className="space-y-4">
          {sorted.map((chain, ci) => {
            const color = CHAIN_COLORS[ci % CHAIN_COLORS.length]
            const isExpanded = expandedChain === chain.id
            return (
              <div key={chain.id} className="neu p-4">
                {/* Chain header */}
                <div className="flex items-center gap-3 mb-3">
                  <div
                    className="w-2 h-8 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm" style={{ color: 'var(--text)' }}>
                      {chain.title}
                    </div>
                  </div>
                  {/* Heat badge */}
                  <div
                    className="font-num text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{
                      backgroundColor: chain.heat > 70 ? 'var(--red)' : chain.heat > 50 ? 'var(--yellow)' : 'var(--green)',
                      color: '#fff',
                      boxShadow: '2px 2px 5px var(--shadow-dark)',
                    }}
                  >
                    🌡️ {chain.heat}
                  </div>
                  {/* Expand toggle */}
                  <button
                    className="neu-btn px-3 py-1 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                    onClick={() => setExpandedChain(isExpanded ? null : chain.id)}
                  >
                    {isExpanded ? '收起' : '失效条件'}
                  </button>
                </div>

                {/* Invalidation condition */}
                {isExpanded && (
                  <div
                    className="neu-inset-sm px-4 py-2 mb-3 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    ⚠️ 何时失效：{chain.invalidation}
                  </div>
                )}

                {/* Nodes — horizontal scroll */}
                <div className="overflow-x-auto pb-2">
                  <div className="flex items-center gap-2" style={{ minWidth: 'max-content' }}>
                    {chain.nodes.map((node, ni) => {
                      const meta = STATUS_META[node.status]
                      return (
                        <div key={ni} className="flex items-center gap-2">
                          {/* Node card */}
                          <div
                            className="neu-inset-sm px-4 py-3 w-40 flex-shrink-0"
                            title={node.term}
                          >
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-sm">{meta.icon}</span>
                              <span className="text-xs font-medium" style={{ color: meta.color }}>
                                {meta.label}
                              </span>
                            </div>
                            <div className="text-xs font-medium leading-tight" style={{ color: 'var(--text)' }}>
                              {node.label}
                            </div>
                            <div className="font-num text-sm font-bold mt-1" style={{ color: meta.color }}>
                              {node.value}
                            </div>
                            {node.threshold && (
                              <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                                线: {node.threshold}
                              </div>
                            )}
                            <div className="text-xs mt-1 opacity-60" style={{ color: 'var(--text-muted)' }}>
                              {node.term}
                            </div>
                          </div>

                          {/* Arrow */}
                          {ni < chain.nodes.length - 1 && (
                            <div className="text-lg flex-shrink-0" style={{ color }}>→</div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Verdict Library ──────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>📚</span> {tr('verdicts_title')}
        </h2>
        <div className="neu p-4 space-y-2">
          {verdicts.map(v => {
            const meta = VERDICT_META[v.status]
            const isOpen = expandedVerdict === v.id
            return (
              <div key={v.id}>
                <button
                  className="w-full text-left neu-sm px-4 py-3 flex items-center gap-3 transition-all"
                  onClick={() => setExpandedVerdict(isOpen ? null : v.id)}
                >
                  <span className="text-lg flex-shrink-0">{meta.icon}</span>
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ backgroundColor: meta.color + '25', color: meta.color }}
                  >
                    {meta.label}
                  </span>
                  <span className="text-sm flex-1 text-left" style={{ color: 'var(--text)' }}>
                    {v.claim}
                  </span>
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="neu-inset-sm mx-2 mt-1 px-4 py-3 text-xs space-y-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>📊 证据：</span>{v.evidence}</div>
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>📖 来源：</span>{v.source}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Prediction Scorecard ─────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🎯</span> {tr('pred_title')}
        </h2>
        <div className="neu p-4 space-y-4">
          {/* Rate probability comparison */}
          <div className="neu-inset p-4 space-y-3">
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              3月FOMC维持不变概率（三源对比）
            </div>
            {rateProbabilities.map(r => (
              <div key={r.source}>
                <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  <span>{r.source}</span>
                  <span className="font-num font-bold" style={{ color: r.color }}>{r.prob}%</span>
                </div>
                <div className="neu-inset-sm h-4 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${r.prob}%`, backgroundColor: r.color, boxShadow: `inset 1px 1px 3px rgba(0,0,0,0.2)` }}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Prediction list */}
          <div className="grid gap-2">
            {predictions.map(p => (
              <div
                key={p.id}
                className="neu-sm px-4 py-3 flex items-center gap-3"
                style={p.status === 'settled' ? { opacity: 0.7 } : {}}
              >
                <span className="text-base">{p.locked ? '🔒' : '🔓'}</span>
                <div className="flex-1">
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{p.question}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    结算: {p.settle_date}
                    {p.result && <span className="ml-2 font-medium">{p.result}</span>}
                  </div>
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: p.status === 'open' ? 'var(--accent)' : 'var(--text-muted)',
                    color: '#fff',
                  }}
                >
                  {p.status === 'open' ? '进行中' : '已结算'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── News Feed + Calendar ─────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* News */}
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span>📡</span> 官方消息流
          </h2>
          <div className="neu p-4 space-y-3">
            {news.map(n => (
              <div key={n.id} className="neu-sm px-4 py-3">
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {n.chain_tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--accent)' }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
                  {n.title}
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {n.source} · {n.time}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Calendar */}
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span>📅</span> 未来30天大事
          </h2>
          <div className="neu p-4 space-y-3">
            {calEvents.map((e, i) => (
              <div key={i} className="neu-sm px-4 py-3 flex gap-3">
                <div
                  className="font-num font-bold text-xs text-center flex-shrink-0 w-12 pt-0.5"
                  style={{ color: 'var(--accent)' }}
                >
                  {e.date.slice(5)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span>{'⭐'.repeat(e.importance)}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {e.event}
                    </span>
                  </div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    看: {e.watch_for}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
