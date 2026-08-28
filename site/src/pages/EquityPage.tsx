import { useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { genSPX, gexData, auctions, alertRules } from '../data/live'
import { asOfMarket, asOfAuction, gexIsPositive, gexSpot, genAt } from '../data/live'

const spxData = genSPX()

// ── Candlestick SVG ────────────────────────────────────────
function CandlestickChart() {
  const W = 780, H = 280, PAD = { top: 20, right: 60, bottom: 28, left: 10 }
  const chartW = W - PAD.left - PAD.right
  const chartH = H - PAD.top - PAD.bottom

  const recent = spxData.slice(-80)
  const prices = recent.flatMap(d => [d.high, d.low])
  const minP = Math.min(...prices) - 30
  const maxP = Math.max(...prices) + 30
  const yScale = (p: number) => chartH - ((p - minP) / (maxP - minP)) * chartH
  const xScale = (i: number) => (i / (recent.length - 1)) * chartW
  const barW = (chartW / recent.length) * 0.65

  // Key levels
  const callWall = 5500, putWall = 5200, gammaFlip = 5350
  const currentPrice = recent[recent.length - 1].close

  return (
    <div className="neu-inset rounded-2xl overflow-hidden" style={{ padding: 8 }}>
      <svg
        width="100%" viewBox={`0 0 ${W} ${H}`}
        style={{ display: 'block', fontFamily: "'Baloo 2', sans-serif" }}
      >
        <g transform={`translate(${PAD.left},${PAD.top})`}>
          {/* Grid lines */}
          {[5200, 5300, 5400, 5500].map(p => (
            <g key={p}>
              <line x1={0} y1={yScale(p)} x2={chartW} y2={yScale(p)}
                stroke="var(--border)" strokeWidth={0.5} strokeDasharray="3,3" opacity={0.5} />
              <text x={chartW + 5} y={yScale(p) + 4} fill="var(--text-muted)" fontSize={9}>
                {p}
              </text>
            </g>
          ))}

          {/* Key levels */}
          <line x1={0} y1={yScale(callWall)} x2={chartW} y2={yScale(callWall)}
            stroke="var(--green)" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.8} />
          <text x={chartW + 5} y={yScale(callWall) + 4} fill="var(--green)" fontSize={9} fontWeight={600}>
            Call {callWall}
          </text>

          <line x1={0} y1={yScale(putWall)} x2={chartW} y2={yScale(putWall)}
            stroke="var(--red)" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.8} />
          <text x={chartW + 5} y={yScale(putWall) + 4} fill="var(--red)" fontSize={9} fontWeight={600}>
            Put {putWall}
          </text>

          <line x1={0} y1={yScale(gammaFlip)} x2={chartW} y2={yScale(gammaFlip)}
            stroke="var(--yellow)" strokeWidth={1.5} strokeDasharray="5,3" opacity={0.8} />
          <text x={chartW + 5} y={yScale(gammaFlip) + 4} fill="var(--yellow)" fontSize={9} fontWeight={600}>
            γFlip {gammaFlip}
          </text>

          {/* Current price */}
          <line x1={0} y1={yScale(currentPrice)} x2={chartW} y2={yScale(currentPrice)}
            stroke="var(--accent)" strokeWidth={1} strokeDasharray="2,2" opacity={0.7} />

          {/* Candles */}
          {recent.map((d, i) => {
            const x = xScale(i)
            const isUp = d.close >= d.open
            const color = isUp ? 'var(--green)' : 'var(--red)'
            const bodyTop = yScale(Math.max(d.open, d.close))
            const bodyBot = yScale(Math.min(d.open, d.close))
            const bodyH = Math.max(bodyBot - bodyTop, 1)
            return (
              <g key={i}>
                {/* Wick */}
                <line
                  x1={x} y1={yScale(d.high)} x2={x} y2={yScale(d.low)}
                  stroke={color} strokeWidth={0.8} opacity={0.9}
                />
                {/* Body */}
                <rect
                  x={x - barW / 2} y={bodyTop}
                  width={barW} height={bodyH}
                  fill={color} rx={1} opacity={0.9}
                />
              </g>
            )
          })}

          {/* X axis labels */}
          {[0, 20, 40, 60, 79].map(i => (
            <text key={i} x={xScale(i)} y={chartH + 18}
              fill="var(--text-muted)" fontSize={8} textAnchor="middle">
              {recent[i]?.date.slice(5)}
            </text>
          ))}
        </g>
      </svg>
    </div>
  )
}

const RULE_STATUS = {
  fire:   { icon: '🔥', label: '已触发', color: 'var(--red)' },
  muted:  { icon: '🔕', label: '静音中', color: 'var(--text-muted)' },
  ok:     { icon: '🟢', label: '正常',   color: 'var(--green)' },
  skip:   { icon: '⏸️', label: '跳过',   color: 'var(--text-muted)' },
  manual: { icon: '✍️', label: '人工',   color: 'var(--accent)' },
}

export default function EquityPage() {
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [ruleFilter, setRuleFilter] = useState<'all' | 'fire' | 'ok'>('all')

  const filteredRules = alertRules.filter(r =>
    ruleFilter === 'all' ? true : r.status === ruleFilter
  )

  const currentPrice = spxData[spxData.length - 1]?.close ?? 5427

  return (
    <div className="space-y-6">

      {/* ── Stat Strip ───────────────────────────────── */}
      <div className="neu p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'SPX现价', value: currentPrice.toFixed(0), color: 'var(--accent)' },
            { label: 'Call墙',  value: '5,500',  color: 'var(--green)' },
            { label: 'γ翻转点', value: '5,350',  color: 'var(--yellow)' },
            { label: 'Put墙',   value: '5,200',  color: 'var(--red)' },
            { label: '净GEX',   value: '+$2.1B', color: 'var(--green)' },
          ].map(s => (
            <div key={s.label} className="neu-inset-sm px-3 py-3 text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              <div className="font-num font-bold text-base" style={{ color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
          做市商状态: {gexIsPositive ? <span style={{ color: 'var(--green)' }}>🟢 正Gamma（价格磁吸，波动小）</span> : <span style={{ color: 'var(--red)' }}>🔴 负Gamma（放大波动）</span>} · as of {genAt} · CBOE延迟链自算
        </div>
      </div>

      {/* ── Candlestick Chart ────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🕯️</span> SPX K线 + 期权价位
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（近80天）</span>
        </h2>
        <div className="neu p-4 overflow-x-auto">
          <CandlestickChart />
          <div className="flex gap-4 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span><span style={{ color: 'var(--green)' }}>— </span>Call墙 5500</span>
            <span><span style={{ color: 'var(--yellow)' }}>— </span>γ翻转 5350</span>
            <span><span style={{ color: 'var(--red)' }}>— </span>Put墙 5200</span>
            <span className="ml-auto">yfinance · as of {asOfMarket}</span>
          </div>
        </div>
      </section>

      {/* ── GEX Bar Chart ────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>📊</span> 各行权价对冲压力 (GEX)
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（单位: $B）</span>
        </h2>
        <div className="neu p-4">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={gexData} barSize={12} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="strike"
                tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: "'Baloo 2'" }}
                tickLine={false} axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9, fill: 'var(--text-muted)', fontFamily: "'Baloo 2'" }}
                tickLine={false} axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  borderRadius: 12,
                  boxShadow: '4px 4px 12px var(--shadow-dark)',
                  fontSize: 11,
                  color: 'var(--text)',
                }}
                formatter={(v: unknown, name: unknown) => [
                  `$${Math.abs(Number(v)).toFixed(2)}B`, name === 'call_gex' ? 'Call GEX' : 'Put GEX',
                ]}
                labelFormatter={(l: unknown) => `行权价: ${l}`}
              />
              <ReferenceLine x={gexSpot ?? 5427} stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1.5} />
              <Bar dataKey="call_gex" fill="var(--green)" radius={[3, 3, 0, 0]} opacity={0.85}>
                {gexData.map((_, i) => (
                  <Cell key={i} fill="var(--green)" />
                ))}
              </Bar>
              <Bar dataKey="put_gex" fill="var(--red)" radius={[0, 0, 3, 3]} opacity={0.85}>
                {gexData.map((_, i) => (
                  <Cell key={i} fill="var(--red)" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-xs text-right mt-1" style={{ color: 'var(--text-muted)' }}>
            CBOE延迟链 · as of {genAt}
          </div>
        </div>
      </section>

      {/* ── Auction Table ────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🏦</span> 国债拍卖记录
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（近6场）</span>
        </h2>
        <div className="neu p-4 overflow-x-auto">
          <div className="neu-inset rounded-xl overflow-hidden">
            <table className="w-full text-xs" style={{ minWidth: 520 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['期限', '日期', '规模', '认购倍数', '海外占比', '尾差(bp)', '结果'].map(h => (
                    <th key={h} className="px-3 py-2 text-left font-medium" style={{ color: 'var(--text-muted)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {auctions.map((a, i) => {
                  const resultMeta = {
                    good: { icon: '🟢', color: 'var(--green)' },
                    ok:   { icon: '🟡', color: 'var(--yellow)' },
                    weak: { icon: '🔴', color: 'var(--red)' },
                  }[a.result]
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg2)' }}
                    >
                      <td className="px-3 py-2 font-num font-medium" style={{ color: 'var(--accent)' }}>{a.term}</td>
                      <td className="px-3 py-2 font-num" style={{ color: 'var(--text-muted)' }}>{a.date}</td>
                      <td className="px-3 py-2 font-num font-medium" style={{ color: 'var(--text)' }}>{a.size}</td>
                      <td className="px-3 py-2 font-num font-bold" style={{ color: a.bid_cover >= 2.5 ? 'var(--green)' : a.bid_cover >= 2.3 ? 'var(--yellow)' : 'var(--red)' }}>
                        {a.bid_cover}×
                      </td>
                      <td className="px-3 py-2 font-num" style={{ color: a.indirect >= 65 ? 'var(--green)' : a.indirect >= 60 ? 'var(--yellow)' : 'var(--red)' }}>
                        {a.indirect}%
                      </td>
                      <td className="px-3 py-2 font-num font-bold" style={{ color: a.tail > 2 ? 'var(--red)' : a.tail > 1 ? 'var(--yellow)' : 'var(--green)' }}>
                        {a.tail}
                      </td>
                      <td className="px-3 py-2">
                        <span style={{ color: resultMeta.color }}>{resultMeta.icon}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
            美国财政部拍卖结果 · 最近 {asOfAuction}
          </div>
        </div>
      </section>

      {/* ── Alert Rules ──────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            <span>🚨</span> 规则警报
            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（30条）</span>
          </h2>
          <div className="neu-sm flex gap-1 p-1 ml-auto">
            {([['all', '全部'], ['fire', '🔥触发'], ['ok', '🟢正常']] as const).map(([v, l]) => (
              <button
                key={v}
                onClick={() => setRuleFilter(v)}
                className="px-3 py-1 text-xs rounded-xl transition-all"
                style={ruleFilter === v
                  ? { backgroundColor: 'var(--accent)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {l}
              </button>
            ))}
          </div>
        </div>
        <div className="neu p-4 space-y-2">
          {filteredRules.map(r => {
            const meta = RULE_STATUS[r.status]
            const isOpen = expandedRule === r.id
            return (
              <div key={r.id}>
                <button
                  className="w-full text-left neu-sm px-4 py-3 flex items-center gap-3 transition-all"
                  onClick={() => setExpandedRule(isOpen ? null : r.id)}
                >
                  <span className="text-base">{meta.icon}</span>
                  <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {r.name}
                  </span>
                  <span
                    className="font-num text-xs"
                    style={{ color: meta.color }}
                  >
                    {r.triggered}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="neu-inset-sm mx-2 mt-1 px-4 py-3 text-xs space-y-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>⚡ 原因: </span>{r.cause}</div>
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>⚠️ 失效: </span>{r.invalidation}</div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}
