import { useState } from 'react'
import { volCalendar, econEvents, calEvents, regimeLive, radarBands } from '../data/live'
import { isEN } from '../i18n'

/* 波动日历（2026-09-21 建，09-22 加「当下进度」与「全年」）
   Momo：「就算放假了、盘感忘了，打开能马上扣出当下周期形式和环境；一整年的固定日；概率可视化。」
   三段：
     ① 当下进度 —— 回来第一眼：今天在周期哪个位置、最近 20 天是躁是静、宏观剧本走到哪
     ② 固定的大日子 —— 近 90 天每行一句人话；全年一览按月排，官方日实线、惯例推算的虚线
     ③ 每个标的 —— 一天 / 一个月 / 一年 通常动多少，最动它的日子
   数据 core/vol_calendar.py 每周重算，全是中位数。规矩：先一句人话，数字跟后面，细节收起来。 */

type Ev = { date: string; type: string; title: string; estimated?: boolean }

const ORDER = ['spx', 'gold', 'dxy', 'us30y', 'usdjpy', 'vix']
const DOW_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON_ZH = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月']
const MON_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const todayISO = () => new Date().toISOString().slice(0, 10)
const daysBetween = (a: string, b: string) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5)
const dow = (d: string) => (isEN ? DOW_EN : DOW_ZH)[new Date(d + 'T12:00:00Z').getUTCDay()]
const fmtUnit = (v: number | null | undefined, unit: string) =>
  v == null ? '—' : unit === '%' ? `${v}%` : unit === 'bp' ? `${v}bp` : `${v}${isEN ? 'pt' : '点'}`

function tone(r: number) {
  if (r >= 1.5) return { fill: 'var(--st-fire)', text: 'var(--st-fire-text)', bg: 'var(--st-fire-bg)' }
  if (r >= 1.2) return { fill: 'var(--st-warn)', text: 'var(--st-warn-text)', bg: 'var(--st-warn-bg)' }
  if (r <= 0.7) return { fill: 'var(--st-ok)', text: 'var(--st-ok-text)', bg: 'var(--st-ok-bg)' }
  return { fill: 'var(--st-mute)', text: 'var(--st-mute-text)', bg: 'var(--st-mute-bg)' }
}
const envWord = (r: number | null | undefined) =>
  r == null ? '—' : r >= 1.2 ? (isEN ? 'restless' : '偏躁') : r <= 0.8 ? (isEN ? 'quiet' : '偏静') : (isEN ? 'normal' : '平常')

/* 一根小条：中线 = 平常（1.0×），条到 2.0× 顶满 */
function Bar({ r }: { r: number }) {
  const w = Math.max(4, Math.min(100, (r / 2) * 100))
  return (
    <span className="relative block h-[7px] rounded-full overflow-hidden" style={{ background: 'var(--bg2)', boxShadow: 'inset 1px 1px 2px var(--shadow-dark)' }}>
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${w}%`, background: tone(r).fill }} />
      <span className="absolute top-[-2px] bottom-[-2px] left-1/2 w-px" style={{ background: 'var(--text-muted)', opacity: .55 }} />
    </span>
  )
}

function Strip({ ratio, assets }: { ratio: Record<string, number>; assets: any }) {
  const rows = ORDER.filter(k => ratio[k] != null).sort((a, b) => ratio[b] - ratio[a])
  return (
    <div className="grid gap-x-2 gap-y-1 items-center text-[11px] font-num mt-2" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
      {rows.map(k => {
        const r = ratio[k]; const t = tone(r); const strong = r >= 1.5 || r <= 0.7
        return [
          <span key={k + 'l'} className="whitespace-nowrap" style={{ color: strong ? t.text : 'var(--text-muted)', fontWeight: r >= 1.5 ? 700 : 400 }}>{isEN ? assets[k]?.label_en : assets[k]?.label}</span>,
          <Bar key={k + 'b'} r={r} />,
          <span key={k + 'v'} style={{ color: strong ? t.text : 'var(--text-muted)', fontWeight: r >= 1.5 ? 700 : 400 }}>{r}×</span>,
        ]
      })}
    </div>
  )
}

/* 一句人话 + 小标签该配什么色 */
function say(ratio: Record<string, number>, assets: any) {
  const ks = ORDER.filter(k => ratio[k] != null)
  if (!ks.length) return { pill: isEN ? 'no sample yet' : '样本还没攒够', kind: 'mute', text: '' }
  const name = (k: string) => (isEN ? assets[k]?.label_en : assets[k]?.label) as string
  const top = ks.reduce((a, b) => (ratio[b] > ratio[a] ? b : a))
  const quiet = ks.filter(k => ratio[k] <= 0.7)
  const spx = ratio.spx
  const approx = (k: string) => { const a = assets[k]; if (!a?.d1 || a.unit !== '%') return ''; return `${isEN ? ', about ' : '，约 '}${(a.d1 * ratio[k]).toFixed(1)}%` }
  let text: string; let pill: string; let kind: string
  if (ratio[top] >= 1.5) {
    kind = 'fire'; pill = isEN ? `${name(top)} big day` : `${name(top)}大日子`
    text = isEN ? `${name(top)} moves the most on days like this: ${ratio[top]}× a normal day${approx(top)}.` : `这种日子${name(top)}动得最大：平常的 ${ratio[top]} 倍${approx(top)}。`
  } else if (ratio[top] >= 1.2) {
    kind = 'warn'; pill = name(top)
    text = (spx != null && spx < 1.2 && top !== 'spx')
      ? (isEN ? `S&P about normal. What moves is ${name(top)} (${ratio[top]}×).` : `标普和平常差不多。动的是${name(top)}（${ratio[top]} 倍）。`)
      : (isEN ? `${name(top)} moves ${ratio[top]}× normal.` : `${name(top)}是平常的 ${ratio[top]} 倍。`)
  } else {
    kind = 'mute'; pill = isEN ? 'about normal' : '和平常差不多'
    text = isEN ? 'Nothing moves much more than usual on days like this.' : '这种日子各标的都和平常差不多。'
  }
  if (quiet.length) {
    const q = quiet.map(name).join(isEN ? ', ' : '、'); const half = quiet.every(k => ratio[k] <= 0.6)
    text += isEN ? ` ${q} ${half ? 'only half as busy as usual' : 'quieter than usual'}.` : `${q}反而${half ? '只有平常一半' : '比平常安静'}。`
  }
  return { pill, kind, text }
}

/* 未来的事件：官方年计划为主，再并上日历里有原标题的 */
function upcoming(vc: any, days: number): Ev[] {
  const today = todayISO(); const horizon = new Date(Date.now() + days * 864e5).toISOString().slice(0, 10)
  const out: Ev[] = []; const seen = new Set<string>()
  const add = (date: string, type: string, title: string, estimated = false) => {
    if (!date || date < today || date > horizon) return
    const k = `${date}|${type}`; if (seen.has(k)) return
    seen.add(k); out.push({ date, type, title, estimated })
  }
  const types: [string, string[]][] = Object.entries(vc.events).map(([k, e]: any) => [k, e.match])
  for (const e of econEvents as any[]) {
    if (e.country && e.country !== 'USD') continue
    const t = types.find(([, ws]) => ws.some((w: string) => (e.title || '').includes(w)))
    if (t) add(e.date, t[0], e.title)
  }
  for (const c of calEvents as any[]) {
    const t = types.find(([, ws]) => ws.some((w: string) => (c.event || '').includes(w)))
    if (t) add(c.date, t[0], c.event)
  }
  for (const p of (vc.year_plan ?? []) as any[]) add(p.date, p.type, '', !!p.estimated)
  for (const d of vc.event_dates?.FOMC ?? []) add(d, 'FOMC', '')
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/* ① 当下进度：回来第一眼 */
function NowStrip({ vc, evs }: { vc: any; evs: Ev[] }) {
  const today = todayISO()
  const next = (t: string) => evs.find(e => e.type === t)
  const nf = next('FOMC'); const nn = next('NFP'); const nc = next('CPI')
  const thisWeek = evs.filter(e => daysBetween(today, e.date) <= 7)
  const A = vc.assets
  const breached = (radarBands as any[]).filter(b => String(b.status).startsWith('breached')).length
  const lab = (t: string) => isEN ? vc.events[t]?.label_en : vc.events[t]?.label
  const dist = (e?: Ev) => e ? `${daysBetween(today, e.date)}${isEN ? 'd' : ' 天'}（${e.date.slice(5)}${e.estimated ? (isEN ? ', est.' : '，预计') : ''}）` : '—'
  const env = (k: string) => { const a = A[k]; if (!a?.recent20_ratio) return null; const r = a.recent20_ratio; return { r, w: envWord(r), t: tone(r >= 1.2 ? 1.3 : r <= 0.8 ? 0.7 : 1), a } }
  const envs = ['spx', 'gold'].map(k => [k, env(k)] as const).filter(([, v]) => v)

  return (
    <div className="neu p-4">
      <div className="flex items-baseline justify-between mb-2.5">
        <h2 className="text-sm font-bold">{isEN ? 'Where we are today' : '当下进度'}</h2>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{isEN ? 'read these three lines first' : '回来先看这三行'}</span>
      </div>
      <div className="space-y-2 text-[13px] leading-relaxed">
        {/* 周期位置 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-num font-bold">{today.slice(5)} {dow(today)}</span>
          <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'to FOMC ' : '离议息 '}</span><span className="font-num">{dist(nf)}</span></span>
          <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'to payrolls ' : '离非农 '}</span><span className="font-num">{dist(nn)}</span></span>
          <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'to CPI ' : '离 CPI '}</span><span className="font-num">{dist(nc)}</span></span>
        </div>
        <div style={{ color: thisWeek.length ? 'var(--text)' : 'var(--text-muted)' }}>
          <span style={{ color: 'var(--text-muted)' }}>{isEN ? 'This week: ' : '本周：'}</span>
          {thisWeek.length
            ? thisWeek.map(e => `${e.date.slice(5)} ${lab(e.type)}`).join(' · ')
            : (isEN ? 'no fixed big day. Whatever moves this week is news, not the calendar.' : '没有固定大日子。这周若动，是消息，不是日历。')}
        </div>
        {/* 最近的环境 */}
        {envs.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span style={{ color: 'var(--text-muted)' }}>{isEN ? 'Last 20 days: ' : '最近 20 天：'}</span>
            {envs.map(([k, v]) => v && (
              <span key={k}>
                {isEN ? v.a.label_en : v.a.label}
                <span className="font-num"> {fmtUnit(v.a.recent20, v.a.unit)}</span>
                <span style={{ color: 'var(--text-muted)' }}>{isEN ? ' a day, ' : '一天，'}</span>
                <span className="badge ml-1" style={{ background: v.t.bg, color: v.t.text, padding: '1px 8px' }}><span className="dot" style={{ background: v.t.fill, width: 6, height: 6 }} />{v.w} {v.r}×</span>
              </span>
            ))}
          </div>
        )}
        {/* 宏观走到哪 */}
        {regimeLive && (
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'Regime: ' : '剧本：'}</span>{regimeLive.name} <span className="font-num">{regimeLive.met}/{regimeLive.total}</span></span>
            {regimeLive.judge?.verdict && <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'Verdict: ' : '判据：'}</span>{regimeLive.judge.verdict}</span>}
            <span><span style={{ color: 'var(--text-muted)' }}>{isEN ? 'Radar: ' : '雷达：'}</span><span className="font-num">{breached}</span>{isEN ? ` of ${(radarBands as any[]).length} bands breached` : ` / ${(radarBands as any[]).length} 条带子已破`}</span>
          </div>
        )}
      </div>
    </div>
  )
}

/* ② 全年一览：按月排，官方实线，惯例推算虚线 */
function YearGrid({ vc, evs }: { vc: any; evs: Ev[] }) {
  const byMonth = new Map<string, Ev[]>()
  for (const e of evs) { const m = e.date.slice(0, 7); if (!byMonth.has(m)) byMonth.set(m, []); byMonth.get(m)!.push(e) }
  const months = [...byMonth.keys()].sort()
  const chip = (e: Ev) => {
    const r: Record<string, number> = vc.events[e.type]?.ratio ?? {}
    const top = Math.max(0, ...Object.values(r))
    const t = tone(top)
    return (
      <span key={e.date + e.type} className="inline-flex items-baseline gap-1 rounded-lg px-2 py-[3px] text-[11px]"
        title={e.estimated ? (isEN ? 'estimated, official date not out yet' : '按惯例推算，官方日期还没出') : ''}
        style={{ background: e.estimated ? 'transparent' : t.bg, color: e.estimated ? 'var(--text-muted)' : t.text,
                 border: e.estimated ? '1px dashed var(--text-muted)' : '1px solid transparent' }}>
        <span className="font-num font-bold">{+e.date.slice(8, 10)}</span>
        <span>{isEN ? vc.events[e.type]?.label_en : vc.events[e.type]?.label}</span>
      </span>
    )
  }
  return (
    <div className="neu p-4">
      <div className="space-y-2">
        {months.map(m => {
          const [y, mm] = m.split('-').map(Number)
          return (
            <div key={m} className="grid gap-2 items-start" style={{ gridTemplateColumns: '58px 1fr' }}>
              <div className="text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                <span className="font-num font-bold" style={{ color: 'var(--text)' }}>{(isEN ? MON_EN : MON_ZH)[mm - 1]}</span>
                <span className="ml-1 text-[10px]">{y}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">{byMonth.get(m)!.map(chip)}</div>
            </div>
          )
        })}
      </div>
      <div className="text-[10.5px] mt-3 leading-snug" style={{ color: 'var(--text-muted)' }}>
        {isEN
          ? 'Chip color = how much the busiest asset moves on that kind of day (red ≥1.5×, pink 1.2–1.5×, grey ≈ normal). Dashed = estimated from the usual schedule; replaced automatically when the official date is published.'
          : '色块颜色 = 这种日子动得最大的那个标的是平常的几倍（红 ≥1.5，粉 1.2–1.5，灰 ≈ 平常）。虚线 = 按惯例推算，官方日期一公布自动替换。'}
      </div>
    </div>
  )
}

export default function VolCalendar() {
  const [open, setOpen] = useState<string | null>(null)
  const [view, setView] = useState<'near' | 'year'>('near')
  const vc = volCalendar
  if (!vc?.events || !vc?.assets) {
    return <div className="neu p-5 text-sm" style={{ color: 'var(--text-muted)' }}>{isEN ? 'Volatility table not computed yet.' : '波动表还没算出来，下次完整跑会生成。'}</div>
  }
  const A = vc.assets
  const year = upcoming(vc, 365)
  const near = year.filter(e => daysBetween(todayISO(), e.date) <= 90).slice(0, 10)

  return (
    <div className="space-y-6">
      <NowStrip vc={vc} evs={year} />

      {/* ── ② 固定的大日子 ── */}
      <section>
        <div className="flex items-center justify-between mb-2 px-1 flex-wrap gap-2">
          <h2 className="text-sm font-bold">{isEN ? 'Fixed big days' : '固定的大日子'}</h2>
          <div className="flex gap-1.5">
            {([['near', isEN ? 'Next 90 days' : '近 90 天'], ['year', isEN ? 'Whole year' : '全年']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
                className={`${view === k ? 'neu-pill-active' : 'neu-pill'} px-3 py-1 text-[11px]`}
                style={{ color: view === k ? 'var(--text)' : 'var(--text-muted)' }}>{l}</button>
            ))}
          </div>
        </div>

        {view === 'year' ? <YearGrid vc={vc} evs={year} /> : (
          <div className="space-y-2.5">
            {!near.length && <div className="neu p-4 text-xs" style={{ color: 'var(--text-muted)' }}>{isEN ? 'No tracked event in the next 90 days.' : '未来 90 天没有在表里的事件。'}</div>}
            {near.map(e => {
              const ev = vc.events[e.type]; const s = say(ev.ratio, A); const t = tone(s.kind === 'fire' ? 1.6 : s.kind === 'warn' ? 1.3 : 1)
              const key = `${e.date}|${e.type}`; const isOpen = open === key
              const orig = e.title.replace(/★/g, '').trim()
              return (
                <div key={key} className="neu px-3.5 py-3">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="font-num font-bold text-sm">{e.date.slice(5)}</span>
                    <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{dow(e.date)}{e.estimated ? (isEN ? ' · est.' : ' · 预计') : ''}</span>
                    <span className="text-sm font-medium flex-1 min-w-0">{isEN ? ev.label_en : ev.label}
                      {orig && !orig.startsWith(ev.label) && orig !== ev.label && <span className="text-[11px] ml-1.5" style={{ color: 'var(--text-muted)' }}>{orig}</span>}
                    </span>
                    <span className="badge" style={{ background: t.bg, color: t.text }}><span className="dot" style={{ background: t.fill }} />{s.pill}</span>
                  </div>
                  <div className="flex gap-2 items-start mt-1.5 text-[13px] leading-relaxed" style={{ color: s.kind === 'mute' ? 'var(--text-muted)' : 'var(--text)' }}>
                    <button onClick={() => setOpen(isOpen ? null : key)} aria-expanded={isOpen} aria-label={isEN ? 'show all six' : '看六个标的'}
                      className="flex-shrink-0 rounded-full text-[11px] leading-none"
                      style={{ width: 18, height: 18, border: '1.5px solid var(--text-muted)', color: 'var(--text-muted)', marginTop: 2, background: isOpen ? 'var(--accent-soft)' : 'transparent' }}>?</button>
                    <span>{s.text}</span>
                  </div>
                  {isOpen && (
                    <div className="neu-inset-sm px-3 py-2.5 mt-2">
                      <Strip ratio={ev.ratio} assets={A} />
                      <div className="text-[10.5px] mt-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                        {isEN ? `Bar past the midline = busier than a normal day. Red ≥1.5×, pink 1.2–1.5×, grey ≈ normal, blue = quieter. ${ev.n} such days since ${vc.window.start}.`
                              : `条越过中线 = 比平常动得大。红 ≥1.5 倍，粉 1.2–1.5，灰 = 差不多，蓝 = 比平常还安静。${vc.window.start} 起共 ${ev.n} 个这种日子。`}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* ── ③ 每个标的 ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2 px-1">
          <h2 className="text-sm font-bold">{isEN ? 'Each asset' : '每个标的通常动多少'}</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{isEN ? 'size only, not direction' : '不分涨跌，只看幅度'}</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {ORDER.filter(k => A[k]).map(k => {
            const a = A[k]
            const days = Object.entries(vc.events as Record<string, any>).filter(([, e]) => e.ratio?.[k] != null)
              .map(([ek, e]) => ({ ek, label: isEN ? e.label_en : e.label, r: e.ratio[k] as number })).sort((x, y) => y.r - x.r)
            const rr = a.recent20_ratio as number | null
            return (
              <div key={k} className="neu p-3.5">
                <div className="flex justify-between items-baseline">
                  <b className="text-sm">{isEN ? a.label_en : a.label}</b>
                  <span className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{a.symbol}</span>
                </div>
                <div className="flex items-baseline gap-2 mt-2">
                  <span className="font-num font-extrabold leading-none" style={{ fontSize: 30 }}>{fmtUnit(a.d1, a.unit)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{isEN ? 'a normal day' : '平常一天'}</span>
                </div>
                {rr != null && (
                  <div className="text-[11px] mt-1" style={{ color: tone(rr >= 1.2 ? 1.3 : rr <= 0.8 ? 0.7 : 1).text }}>
                    {isEN ? `last 20 days ${fmtUnit(a.recent20, a.unit)}, ${envWord(rr)} (${rr}×)` : `最近 20 天 ${fmtUnit(a.recent20, a.unit)}，${envWord(rr)}（${rr} 倍）`}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-2.5">
                  {[[a.d21, isEN ? 'a month' : '一个月'], [a.d252, isEN ? 'a year' : '一年']].map(([v, l]) => (
                    <div key={String(l)} className="neu-inset-sm px-2.5 py-1.5">
                      <div className="font-num font-bold text-base leading-tight">{fmtUnit(v as number, a.unit)}</div>
                      <div className="text-[10.5px]" style={{ color: 'var(--text-muted)' }}>{l}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <div className="text-[10.5px] mb-1.5 tracking-wide" style={{ color: 'var(--text-muted)' }}>{isEN ? 'Days that move it most (× normal)' : '最动它的日子（是平常的几倍）'}</div>
                  <div className="grid gap-x-2 gap-y-1 items-center text-[11px] font-num" style={{ gridTemplateColumns: 'auto 1fr auto' }}>
                    {days.map(d => { const t = tone(d.r); const strong = d.r >= 1.2 || d.r <= 0.7; return [
                      <span key={d.ek + 'l'} style={{ color: strong ? t.text : 'var(--text-muted)' }}>{d.label}</span>,
                      <Bar key={d.ek + 'b'} r={d.r} />,
                      <span key={d.ek + 'v'} style={{ color: strong ? t.text : 'var(--text-muted)', fontWeight: strong ? 700 : 400 }}>{d.r}×</span>,
                    ] })}
                  </div>
                  {days.some(d => d.r <= 0.6) && (
                    <div className="text-[10.5px] mt-1.5" style={{ color: 'var(--st-ok-text)' }}>
                      {isEN ? `On ${days.filter(d => d.r <= 0.6).map(d => d.label).join(', ')} days it is only about half as busy as usual.`
                            : `${days.filter(d => d.r <= 0.6).map(d => d.label).join('、')}日它反而只有平常一半。`}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="text-[10.5px] mt-3 px-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {isEN ? `${vc.window.start} → ${vc.window.end}, ${vc.n_baseline_days} normal days. Medians: the middle is small, the tail is fat.`
                : `${vc.window.start} → ${vc.window.end}，平常日子 ${vc.n_baseline_days} 天。都是中位数：中间小，尾巴肥。`}
          {A.gold?.max_event_day?.FOMC != null && (isEN ? ` Gold's biggest FOMC-day move was ${A.gold.max_event_day.FOMC}%.` : ` 议息日黄金最大动过 ${A.gold.max_event_day.FOMC}%。`)}
          {isEN ? ' Recomputed weekly.' : ' 每周自动重算。'}
        </div>
      </section>
    </div>
  )
}
