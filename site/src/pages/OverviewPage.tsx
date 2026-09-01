import { useState, useEffect } from 'react'
import Globe from '../components/Globe'
import Sparkline from '../components/Sparkline'
import { fetchLiveQuotes, diverges, liveFor } from '../data/liveQuote'
import type { LiveQuote } from '../data/liveQuote'
import { snapshots, alerts, alertsNoBands, radarBands, ticLive, regimeLive } from '../data/live'
import type { RadarBand } from '../data/live'
import { EXPLAIN, UNIT_HINT } from '../data/explain'
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
  // 点开的"这是啥"面板（一次只开一个，手机上不至于整页都是展开的字）
  const [openWhat, setOpenWhat] = useState<string | null>(null)

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


  return (
    <div className="space-y-6">

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
                  {/* 有条件没数时讲出来，否则 0/3 和 1/3 之间的跳动没人看得懂 */}
                  {!!regimeLive?.unknown && `（其中${regimeLive.unknown}条暂时没数）`}
                </div>
              </div>
            </div>

            {/* 一句话说清这个剧本是什么意思——不能只丢三个条件让人自己拼 */}
            {regimeLive?.plain && (
              <div className="text-xs mb-3" style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>
                {regimeLive.plain}
              </div>
            )}

            <div className="space-y-2">
              {(regimeLive?.conds ?? []).map((c, i) => (
                <div
                  key={i}
                  className="neu-inset-sm flex items-center gap-3 px-4 py-3"
                  title={c.known ? undefined : '这条的数据源暂时取不到，不拿旧数充数'}
                >
                  {/* 三态：成立(红) / 不成立(灰实心) / 没数(空心圈) */}
                  <span className="dot flex-shrink-0" style={{
                    backgroundColor: !c.known ? 'transparent' : c.met ? 'var(--st-fire)' : 'var(--st-mute)',
                    border: c.known ? 'none' : '1.5px dashed var(--text-muted)',
                  }} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium" style={{
                      color: c.known ? 'var(--text)' : 'var(--text-muted)' }}>
                      {c.label}
                    </div>
                  </div>
                  <div
                    className="font-num text-sm font-bold flex-shrink-0"
                    style={{ color: c.met ? 'var(--st-fire-text)' : 'var(--text-muted)' }}
                  >
                    {c.known ? c.value : (isEN ? 'no data' : '暂无数据')}
                  </div>
                </div>
              ))}
            </div>

            {/* 判据结果：这个剧本自己写了"什么情况算它不成立"，就得真去算。
                8-25报告原话：真利率跳升而金不跌→确认；金随真利率同步回落→回到需求侧紧缩链 */}
            {regimeLive?.judge && (
              <div className="neu-inset-sm px-4 py-3 mt-3">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {isEN ? 'test result' : '判据结果'}
                  </span>
                  <span className="text-sm font-bold" style={{
                    color: regimeLive.judge.verdict === '判据未触发'
                      ? 'var(--text-muted)' : 'var(--st-fire-text)' }}>
                    {regimeLive.judge.verdict}
                  </span>
                </div>
                <div className="text-xs" style={{ color: 'var(--text)', lineHeight: 1.6 }}>
                  {regimeLive.judge.plain}
                </div>
                <div className="font-num text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  近{regimeLive.judge.window_days}天：真利率 {regimeLive.judge.tips_chg_bp >= 0 ? '+' : ''}
                  {regimeLive.judge.tips_chg_bp}bp · 黄金 {regimeLive.judge.gold_chg_pct}%
                </div>
                <div className="text-xs mt-1" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>
                  {isEN ? 'rule: ' : '判定规则：'}{regimeLive.judge.rule}
                </div>
              </div>
            )}

            {/* 加息概率取了哪个源——三源打架时不让人猜 */}
            {regimeLive?.sourceNote && (
              <div className="text-xs mt-2" style={{ color: 'var(--text-muted)', opacity: 0.75 }}>
                加息概率取自：{regimeLive.sourceNote}
              </div>
            )}
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
            <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>{isEN ? ` (${nWatch} ${tr('radar_n')})` : `（${nWatch}${tr('radar_n')}）`}</span>
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
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{isEN ? ` (as of ${snapshots[0]?.as_of ?? '—'})` : `（截至 ${snapshots[0]?.as_of ?? '—'}）`}</span>
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
            // 用 liveFor 处理两层命名差异（gold↔gc / silver↔xag / brent↔oil）
            const q = liveFor(live, s.key)
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
            // 变化量的文字 + 它用了什么单位（bp/pp 要另外解释，%不用）
            const chgUnit: 'bp' | 'pp' | '%' =
              (!showLive && s.change_pp != null)
                ? (Math.abs(s.change_pp) >= 1 ? 'pp' : 'bp')
                : '%'
            const chgText =
              chgUnit === 'pp' ? `${Math.abs(s.change_pp!).toFixed(2)}pp`
              : chgUnit === 'bp' ? `${Math.round(Math.abs(s.change_pp!) * 100)}bp`
              : `${Math.abs(chg).toFixed(2)}%`
            const ex = EXPLAIN[s.key]
            const opened = openWhat === s.key
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
                  <span className="flex items-center gap-1 flex-shrink-0">
                    <span
                      className="font-num text-xs px-1.5 py-0.5 rounded-lg"
                      style={{
                        backgroundColor: up ? '#6bb89a22' : '#e0787822',
                        color: up ? 'var(--green)' : 'var(--red)',
                      }}
                    >
                      {/* 利率/比率类显示"几个基点"，其余显示百分比。
                          4.67%→4.70% 说成"+0.6%"反直觉，说成"+3bp"才不会看错位数。
                          bp/pp 是行话——所以右边配了"?"，点开就是大白话 */}
                      {up ? '▲' : '▼'} {chgText}
                    </span>
                    {ex && (
                      <button
                        onClick={() => setOpenWhat(opened ? null : s.key)}
                        aria-label={isEN ? 'what is this' : '这是什么'}
                        title={isEN ? 'what is this' : '这是什么'}
                        className="rounded-full flex items-center justify-center transition-transform hover:scale-110"
                        style={{
                          width: 18, height: 18, fontSize: 11, lineHeight: 1,
                          border: 'none', cursor: 'pointer',
                          backgroundColor: opened ? 'var(--accent)' : 'var(--bg2)',
                          color: opened ? '#fff' : 'var(--text-muted)',
                        }}
                      >?</button>
                    )}
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

                {/* 「这是什么」大白话面板：是什么 → 为什么看它 → 往上意味着什么。
                    不用弹窗——手机上弹窗要多点一次才能关掉 */}
                {opened && ex && (
                  <div className="neu-inset-sm p-2.5 mt-1 flex flex-col gap-1.5"
                    style={{ fontSize: 12, lineHeight: 1.6, color: 'var(--text)' }}>
                    <div>{ex.what}</div>
                    {ex.why && (
                      <div style={{ color: 'var(--text-muted)' }}>{ex.why}</div>
                    )}
                    {/* 方向说明写死成"往上=什么"，不跟当前涨跌绑一起。
                        绑一起会写出"现在是往下，反过来看：往上=裁员增加"这种绕话 */}
                    {ex.up && (
                      <div className="flex items-baseline gap-1">
                        <span style={{ color: 'var(--green)' }}>▲</span>
                        <span>{ex.up}</span>
                      </div>
                    )}
                    {UNIT_HINT[chgUnit] && (
                      <div className="pt-1" style={{ color: 'var(--text-muted)', borderTop: '1px dashed var(--border)' }}>
                        {UNIT_HINT[chgUnit]}
                      </div>
                    )}
                  </div>
                )}

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
