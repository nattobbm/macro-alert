import { useState } from 'react'
import {
  BarChart, Bar, Cell, XAxis, YAxis, ReferenceLine,
  Tooltip, ResponsiveContainer,
} from 'recharts'
import { genSPX, gexData, auctions, alertRules } from '../data/live'
import { t as tr } from '../i18n'
import {
  asOfMarket, asOfAuction, gexIsPositive, gexSpot, gexFlip,
  gexCallWall, gexPutWall, gexNetBn, gexHistory, genAt,
} from '../data/live'
import Kline from '../components/Kline'
import TradingStrip from '../components/TradingStrip'

const spxData = genSPX()

const RULE_STATUS = {
  fire:   { label: '已触发', dot: 'var(--st-fire)', text: 'var(--st-fire-text)' },
  muted:  { label: '静音中', dot: 'var(--st-mute)', text: 'var(--st-mute-text)' },
  ok:     { label: '正常',   dot: 'var(--st-ok)',   text: 'var(--st-ok-text)' },
  skip:   { label: '跳过',   dot: 'var(--st-mute)', text: 'var(--st-mute-text)' },
  manual: { label: '人工',   dot: 'var(--accent)',  text: 'var(--accent)' },
}

const n0 = (v: number | null) => v == null ? '—' : Math.round(v).toLocaleString('en-US')

export default function EquityPage() {
  const [expandedRule, setExpandedRule] = useState<string | null>(null)
  const [ruleFilter, setRuleFilter] = useState<'all' | 'fire' | 'ok'>('all')

  const filteredRules = alertRules.filter(r =>
    ruleFilter === 'all' ? true : r.status === ruleFilter
  )

  const currentPrice = gexSpot ?? spxData[spxData.length - 1]?.close ?? null
  const distPct = (level: number | null) =>
    level != null && currentPrice != null
      ? `${level >= currentPrice ? '+' : ''}${((level - currentPrice) / currentPrice * 100).toFixed(1)}%`
      : ''

  return (
    <div className="space-y-6">

      {/* ── 盘口：实际交易的标的（2026-09-01 从总览页移来） ───── */}
      <TradingStrip />

      {/* ── Stat Strip（CBOE延迟链自算，全真数据） ───── */}
      <div className="neu p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'SPX现价', value: n0(currentPrice), sub: '', color: 'var(--accent)' },
            { label: 'Call墙',  value: n0(gexCallWall), sub: distPct(gexCallWall), color: 'var(--green)' },
            { label: 'γ翻转点', value: n0(gexFlip),     sub: distPct(gexFlip),     color: 'var(--yellow)' },
            { label: 'Put墙',   value: n0(gexPutWall),  sub: distPct(gexPutWall),  color: 'var(--red)' },
            { label: '净GEX',
              value: gexNetBn == null ? '—' : `${gexNetBn >= 0 ? '+' : '−'}$${Math.abs(gexNetBn).toFixed(1)}B`,
              sub: gexNetBn == null ? '' : (gexNetBn >= 0 ? '压波动' : '放大波动'),
              color: gexNetBn != null && gexNetBn < 0 ? 'var(--st-fire-text)' : 'var(--green)' },
          ].map(s => (
            <div key={s.label} className="neu-inset-sm px-3 py-3 text-center">
              <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
              <div className="font-num font-bold text-base" style={{ color: s.color }}>{s.value}</div>
              {s.sub && <div className="text-xs font-num" style={{ color: 'var(--text-muted)' }}>{s.sub}</div>}
            </div>
          ))}
        </div>
        <div className="text-xs mt-2 text-right flex items-center justify-end gap-2" style={{ color: 'var(--text-muted)' }}>
          {tr('mm_state')}:
          <span className="badge" style={{
            backgroundColor: gexIsPositive ? 'var(--st-ok-bg)' : 'var(--st-fire-bg)',
            color: gexIsPositive ? 'var(--st-ok-text)' : 'var(--st-fire-text)',
          }}>
            <span className="dot" style={{ backgroundColor: gexIsPositive ? 'var(--st-ok)' : 'var(--st-fire)' }} />
            {gexIsPositive ? tr('pos_gamma') : tr('neg_gamma')}
          </span>
          · as of {genAt} · CBOE延迟链自算
        </div>
      </div>

      {/* ── K线（可滑动缩放） ────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          SPX K线 + 期权价位
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
            （近2年 · 可拖动缩放）
          </span>
        </h2>
        <div className="neu p-4">
          <div className="neu-inset rounded-2xl" style={{ padding: 8 }}>
            <Kline height={340} />
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span><span style={{ color: 'var(--green)' }}>— </span>Call墙 {n0(gexCallWall)}</span>
            <span><span style={{ color: 'var(--yellow)' }}>— </span>γ翻转 {n0(gexFlip)}</span>
            <span><span style={{ color: 'var(--red)' }}>— </span>Put墙 {n0(gexPutWall)}</span>
            {gexHistory.length >= 2 && (
              <span>虚线=墙位每日轨迹（{gexHistory[0]?.date}起自建存档）</span>
            )}
            <span className="ml-auto">yfinance · as of {asOfMarket}</span>
          </div>
        </div>
      </section>

      {/* ── GEX Bar Chart ────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          各行权价对冲压力 (GEX)
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
              {gexSpot != null && (
                <ReferenceLine x={gexSpot} stroke="var(--accent)" strokeDasharray="4 3" strokeWidth={1.5} />
              )}
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
          {tr('auction_title')}记录
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
                  // 配色与规则引擎T1对齐：认购<2.2恶化 / >2.4健康；tail>2bp恶化
                  const resultMeta = {
                    good: { color: 'var(--st-ok)' },
                    ok:   { color: 'var(--st-mute)' },
                    weak: { color: 'var(--st-fire)' },
                  }[a.result]
                  return (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--border)', backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--bg2)' }}
                    >
                      <td className="px-3 py-2 font-num font-medium" style={{ color: 'var(--accent)' }}>{a.term}</td>
                      <td className="px-3 py-2 font-num" style={{ color: 'var(--text-muted)' }}>{a.date}</td>
                      <td className="px-3 py-2 font-num font-medium" style={{ color: 'var(--text)' }}>{a.size}</td>
                      <td className="px-3 py-2 font-num font-bold" style={{ color: a.bid_cover >= 2.4 ? 'var(--st-ok-text)' : a.bid_cover >= 2.2 ? 'var(--text)' : 'var(--st-fire-text)' }}>
                        {a.bid_cover}×
                      </td>
                      <td className="px-3 py-2 font-num" style={{ color: a.indirect >= 65 ? 'var(--st-ok-text)' : a.indirect >= 60 ? 'var(--text)' : 'var(--st-fire-text)' }}>
                        {a.indirect}%
                      </td>
                      <td className="px-3 py-2 font-num font-bold" style={{ color: a.tail > 2 ? 'var(--st-fire-text)' : a.tail > 1 ? 'var(--st-warn-text)' : 'var(--st-ok-text)' }}>
                        {a.tail}
                      </td>
                      <td className="px-3 py-2">
                        <span className="dot" style={{ backgroundColor: resultMeta.color }} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
            {tr('auction_src')} {asOfAuction}
          </div>
        </div>
      </section>

      {/* ── Alert Rules ──────────────────────────────── */}
      <section>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--text)' }}>
            规则警报
            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>（{alertRules.length}条）</span>
          </h2>
          <div className="neu-sm flex gap-1 p-1 ml-auto">
            {([['all', '全部'], ['fire', '触发'], ['ok', '正常']] as const).map(([v, l]) => (
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
                  <span className="dot" style={{ backgroundColor: meta.dot }} />
                  <span className="flex-1 text-sm font-medium" style={{ color: 'var(--text)' }}>
                    {r.name}
                  </span>
                  <span className="text-xs" style={{ color: meta.text }}>{meta.label}</span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>
                {isOpen && (
                  <div
                    className="neu-inset-sm mx-2 mt-1 px-4 py-3 text-xs space-y-1"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>读数: </span>{r.triggered}</div>
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>原因: </span>{r.cause}</div>
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>失效: </span>{r.invalidation}</div>
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
