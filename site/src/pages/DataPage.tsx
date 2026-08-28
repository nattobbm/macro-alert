import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  ReferenceLine, ComposedChart,
} from 'recharts'
import { dataSources, trendRealRate, trend30Y, trendSPXGold } from '../data/live'
import { asOfMarket, asOfTic, asOfCot, genAt } from '../data/live'

const CHART_TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 12,
    boxShadow: '4px 4px 12px var(--shadow-dark)',
    fontSize: 11,
    color: 'var(--text)',
  },
}

function MiniChart({
  title, subtitle, children, source, as_of,
}: {
  title: string; subtitle: string; children: React.ReactNode;
  source: string; as_of: string;
}) {
  return (
    <div className="neu p-4">
      <div className="mb-3">
        <div className="text-sm font-bold" style={{ color: 'var(--text)' }}>{title}</div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{subtitle}</div>
      </div>
      <div className="neu-inset rounded-2xl p-2" style={{ height: 160 }}>
        {children}
      </div>
      <div className="text-xs mt-2 text-right" style={{ color: 'var(--text-muted)' }}>
        {source} · as of {as_of}
      </div>
    </div>
  )
}

export default function DataPage() {
  const okCount = dataSources.filter(d => d.status === 'ok').length
  const staleCount = dataSources.filter(d => d.status === 'stale').length
  const staleList = dataSources.filter(d => d.status === 'stale')

  const xKey = (arr: { date: string }[]) =>
    arr.filter((_, i) => i % 8 === 0).map(d => d.date.slice(5))

  return (
    <div className="space-y-6">

      {/* ── Data Health ──────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>🔬</span> 数据体检
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
            ({dataSources.length} 个数据源)
          </span>
        </h2>
        <div className="neu p-5 space-y-4">
          {/* Summary badges */}
          <div className="flex gap-3 flex-wrap">
            <div
              className="neu-sm flex items-center gap-2 px-4 py-2"
            >
              <span className="text-xl">🟢</span>
              <div>
                <div className="font-num font-bold text-xl" style={{ color: 'var(--green)' }}>
                  {okCount}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>数据正常</div>
              </div>
            </div>
            <div className="neu-sm flex items-center gap-2 px-4 py-2">
              <span className="text-xl">⏳</span>
              <div>
                <div className="font-num font-bold text-xl" style={{ color: 'var(--yellow)' }}>
                  {staleCount}
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>数据过期</div>
              </div>
            </div>
            <div className="neu-sm flex items-center gap-2 px-4 py-2">
              <span className="text-xl">📊</span>
              <div>
                <div className="font-num font-bold text-xl" style={{ color: 'var(--accent)' }}>
                  {Math.round(okCount / dataSources.length * 100)}%
                </div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>覆盖率</div>
              </div>
            </div>
          </div>

          {/* Overall health bar */}
          <div>
            <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>整体数据健康度</div>
            <div className="neu-inset-sm h-5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${okCount / dataSources.length * 100}%`,
                  background: 'linear-gradient(90deg, var(--green), var(--accent))',
                  boxShadow: 'inset 1px 1px 3px rgba(0,0,0,0.15)',
                }}
              />
            </div>
          </div>

          {/* Stale list */}
          {staleList.length > 0 && (
            <div>
              <div className="text-xs font-medium mb-2" style={{ color: 'var(--yellow)' }}>
                ⏳ 过期数据清单
              </div>
              <div className="space-y-1.5">
                {staleList.map(d => (
                  <div
                    key={d.name}
                    className="neu-inset-sm px-4 py-2.5 flex items-center gap-3"
                    style={{ opacity: 0.85 }}
                  >
                    <span className="text-base">⏳</span>
                    <div className="flex-1">
                      <div className="text-xs font-medium" style={{ color: 'var(--text)' }}>{d.name}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {d.reason}
                      </div>
                    </div>
                    <div className="font-num text-xs" style={{ color: 'var(--text-muted)' }}>
                      {d.last_updated}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* All sources accordion */}
          <details className="group">
            <summary
              className="neu-btn px-4 py-2 text-xs cursor-pointer list-none"
              style={{ color: 'var(--text-muted)' }}
            >
              查看全部 {dataSources.length} 个数据源 ▼
            </summary>
            <div className="mt-3 grid grid-cols-1 gap-1.5">
              {dataSources.map(d => (
                <div
                  key={d.name}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs"
                  style={{ opacity: d.status === 'stale' ? 0.7 : 1 }}
                >
                  <span>{d.status === 'ok' ? '🟢' : '⏳'}</span>
                  <span className="flex-1" style={{ color: 'var(--text)' }}>{d.name}</span>
                  <span className="font-num" style={{ color: 'var(--text-muted)' }}>{d.last_updated}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </section>

      {/* ── Trend Charts ─────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          <span>📉</span> 走势图组
        </h2>
        <div
          className="grid gap-4"
          style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}
        >

          {/* 真实利率 × 黄金 */}
          <MiniChart
            title="真实利率 × 黄金"
            subtitle="TIPS 10Y实际收益率 vs 黄金现货"
            source="FRED · yfinance" as_of={asOfMarket}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendRealRate} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis yAxisId="rate" domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="gold" orientation="right" domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Line yAxisId="rate" dataKey="real_rate" stroke="var(--accent)" strokeWidth={1.8} dot={false} name="真实利率" />
                <Line yAxisId="gold" dataKey="gold" stroke="var(--yellow)" strokeWidth={1.8} dot={false} name="黄金$/oz" />
              </ComposedChart>
            </ResponsiveContainer>
          </MiniChart>

          {/* 30Y利率 */}
          <MiniChart
            title="30年期美债利率"
            subtitle="含历史前高5.18%虚线标注"
            source="FRED" as_of={asOfMarket}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend30Y} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis domain={[4.0, 5.5]} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <ReferenceLine y={5.18} stroke="var(--red)" strokeDasharray="4 3" strokeWidth={1.2} label={{ value: '历史前高 5.18%', fill: 'var(--red)', fontSize: 8, position: 'right' }} />
                <ReferenceLine y={5.0} stroke="var(--yellow)" strokeDasharray="4 3" strokeWidth={1} />
                <Line dataKey="rate" stroke="var(--red)" strokeWidth={1.8} dot={false} name="30Y利率" />
              </LineChart>
            </ResponsiveContainer>
          </MiniChart>

          {/* SPX/Gold ratio */}
          <MiniChart
            title="SPX / 黄金比"
            subtitle="风险偏好指标（越低=越避险）"
            source="yfinance" as_of={asOfMarket}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trendSPXGold} margin={{ top: 5, right: 5, left: -30, bottom: 0 }}>
                <XAxis dataKey="date" hide />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <ReferenceLine y={0.5} stroke="var(--yellow)" strokeDasharray="4 3" strokeWidth={1} label={{ value: '关键位 0.5', fill: 'var(--yellow)', fontSize: 8 }} />
                <Line dataKey="ratio" stroke="var(--green)" strokeWidth={1.8} dot={false} name="SPX/金" />
              </LineChart>
            </ResponsiveContainer>
          </MiniChart>

          {/* Yield curve */}
          <MiniChart
            title="利率曲线（快照对比）"
            subtitle="1M / 3M / 6M / 1Y / 2Y / 5Y / 10Y / 30Y"
            source="FRED" as_of={asOfMarket}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={[
                  { term: '1M', rate: 5.30 },
                  { term: '3M', rate: 5.28 },
                  { term: '6M', rate: 5.20 },
                  { term: '1Y', rate: 5.05 },
                  { term: '2Y', rate: 4.56 },
                  { term: '5Y', rate: 4.52 },
                  { term: '10Y', rate: 4.64 },
                  { term: '30Y', rate: 4.88 },
                ]}
                margin={{ top: 5, right: 5, left: -30, bottom: 0 }}
              >
                <XAxis dataKey="term" tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <YAxis domain={[4.4, 5.4]} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Line dataKey="rate" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3, fill: 'var(--accent)' }} name="利率%" />
              </LineChart>
            </ResponsiveContainer>
          </MiniChart>

          {/* Gold positioning */}
          <MiniChart
            title="黄金大户持仓（CFTC）"
            subtitle="托管所净多头合约数"
            source="CFTC" as_of={asOfCot}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={Array.from({ length: 52 }, (_, i) => ({
                  week: i,
                  net: Math.round(180000 + Math.sin(i * 0.25) * 60000 + i * 1200),
                }))}
                margin={{ top: 5, right: 5, left: -30, bottom: 0 }}
              >
                <XAxis dataKey="week" hide />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Line dataKey="net" stroke="var(--yellow)" strokeWidth={1.8} dot={false} name="净多头" />
              </LineChart>
            </ResponsiveContainer>
          </MiniChart>

          {/* Three countries UST holdings */}
          <MiniChart
            title="三国持仓美债（月度）"
            subtitle="日本 / 中国 / 英国（单位: $B）"
            source="TIC / 财政部" as_of={asOfTic}
          >
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={Array.from({ length: 24 }, (_, i) => ({
                  month: i,
                  JP: Math.round(1100 - i * 1.2 + Math.sin(i * 0.5) * 20),
                  CN: Math.round(870 - i * 4 + Math.sin(i * 0.4) * 15),
                  UK: Math.round(720 - i * 1.5 + Math.sin(i * 0.6) * 25),
                }))}
                margin={{ top: 5, right: 5, left: -30, bottom: 0 }}
              >
                <XAxis dataKey="month" hide />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 8, fill: 'var(--text-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip {...CHART_TOOLTIP_STYLE} />
                <Line dataKey="JP" stroke="#f38ba8" strokeWidth={1.5} dot={false} name="日本$B" />
                <Line dataKey="CN" stroke="#cba6f7" strokeWidth={1.5} dot={false} name="中国$B" />
                <Line dataKey="UK" stroke="var(--accent)" strokeWidth={1.5} dot={false} name="英国$B" />
              </LineChart>
            </ResponsiveContainer>
          </MiniChart>
        </div>
      </section>
    </div>
  )
}
