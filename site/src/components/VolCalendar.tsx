import { useState } from 'react'
import { volCalendar, econEvents, calEvents } from '../data/live'
import { isEN } from '../i18n'

/* 波动日历（2026-09-21）
   第一步：未来的大日子 —— 每行一句人话「这种日子谁动得最大、平常的几倍」，六个标的的小条收进「?」。
   第二步：单个标的 —— 一天 / 一个月 / 一年 通常动多少，最动它的日子。
   数据 core/vol_calendar.py 每周重算，全是中位数。规矩：先一句人话，数字跟后面，细节收起来。 */

type Ev = { date: string; type: string; title: string }

const ORDER = ['spx', 'gold', 'dxy', 'us30y', 'usdjpy', 'vix']
const DOW_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const fmtUnit = (v: number | null | undefined, unit: string) =>
  v == null ? '—' : unit === '%' ? `${v}%` : unit === 'bp' ? `${v}bp` : `${v}${isEN ? 'pt' : '点'}`

function tone(r: number) {
  if (r >= 1.5) return { fill: 'var(--st-fire)', text: 'var(--st-fire-text)', bg: 'var(--st-fire-bg)' }
  if (r >= 1.2) return { fill: 'var(--st-warn)', text: 'var(--st-warn-text)', bg: 'var(--st-warn-bg)' }
  if (r <= 0.7) return { fill: 'var(--st-ok)', text: 'var(--st-ok-text)', bg: 'var(--st-ok-bg)' }
  return { fill: 'var(--st-mute)', text: 'var(--st-mute-text)', bg: 'var(--st-mute-bg)' }
}

/* 一根小条：中线 = 平常（1.0×），条到 2.0× 顶满 */
function Bar({ r }: { r: number }) {
  const w = Math.max(4, Math.min(100, (r / 2) * 100))
  return (
    <span className="neu-inset-sm relative block h-[7px] rounded-full overflow-hidden" style={{ boxShadow: 'inset 1px 1px 2px var(--shadow-dark)' }}>
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
        const r = ratio[k]; const t = tone(r)
        return [
          <span key={k + 'l'} className="whitespace-nowrap" style={{ color: r >= 1.5 || r <= 0.7 ? t.text : 'var(--text-muted)', fontWeight: r >= 1.5 ? 700 : 400 }}>
            {isEN ? assets[k]?.label_en : assets[k]?.label}
          </span>,
          <Bar key={k + 'b'} r={r} />,
          <span key={k + 'v'} style={{ color: r >= 1.5 || r <= 0.7 ? t.text : 'var(--text-muted)', fontWeight: r >= 1.5 ? 700 : 400 }}>{r}×</span>,
        ]
      })}
    </div>
  )
}

/* 一句人话 + 该配什么色的小标签 */
function say(ratio: Record<string, number>, assets: any) {
  const ks = ORDER.filter(k => ratio[k] != null)
  if (!ks.length) return { pill: isEN ? 'no sample yet' : '样本还没攒够', kind: 'mute', text: '' }
  const name = (k: string) => (isEN ? assets[k]?.label_en : assets[k]?.label) as string
  const top = ks.reduce((a, b) => (ratio[b] > ratio[a] ? b : a))
  const quiet = ks.filter(k => ratio[k] <= 0.7)
  const spx = ratio.spx
  const approx = (k: string) => {
    const a = assets[k]; if (!a?.d1) return ''
    const v = a.d1 * ratio[k]
    return a.unit === '%' ? `${isEN ? ', about ' : '，约 '}${v.toFixed(1)}%` : ''
  }
  let text: string; let pill: string; let kind: string
  if (ratio[top] >= 1.5) {
    kind = 'fire'
    pill = isEN ? `${name(top)} big day` : `${name(top)}大日子`
    text = isEN
      ? `${name(top)} moves the most on days like this: ${ratio[top]}× a normal day${approx(top)}.`
      : `这种日子${name(top)}动得最大：平常的 ${ratio[top]} 倍${approx(top)}。`
  } else if (ratio[top] >= 1.2) {
    kind = 'warn'
    pill = name(top)
    text = (spx != null && spx < 1.2 && top !== 'spx')
      ? (isEN ? `S&P about normal. What moves is ${name(top)} (${ratio[top]}×).` : `标普和平常差不多。动的是${name(top)}（${ratio[top]} 倍）。`)
      : (isEN ? `${name(top)} moves ${ratio[top]}× normal.` : `${name(top)}是平常的 ${ratio[top]} 倍。`)
  } else {
    kind = 'mute'
    pill = isEN ? 'about normal' : '和平常差不多'
    text = isEN ? 'Nothing moves much more than usual on days like this.' : '这种日子各标的都和平常差不多。'
  }
  if (quiet.length) {
    const q = quiet.map(name).join(isEN ? ', ' : '、')
    const half = quiet.every(k => ratio[k] <= 0.6)
    text += isEN ? ` ${q} ${half ? 'only half as busy as usual' : 'quieter than usual'}.` : `${q}反而${half ? '只有平常一半' : '比平常安静'}。`
  }
  return { pill, kind, text }
}

function upcoming(vc: any): Ev[] {
  const today = new Date().toISOString().slice(0, 10)
  const horizon = new Date(Date.now() + 90 * 864e5).toISOString().slice(0, 10)
  const out: Ev[] = []
  const seen = new Set<string>()
  const add = (date: string, type: string, title: string) => {
    if (!date || date < today || date > horizon) return
    const k = `${date}|${type}`; if (seen.has(k)) return
    seen.add(k); out.push({ date, type, title })
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
  for (const d of vc.event_dates?.FOMC ?? []) add(d, 'FOMC', isEN ? 'FOMC decision' : '议息决议')
  return out.sort((a, b) => a.date.localeCompare(b.date)).slice(0, 8)
}

export default function VolCalendar() {
  const [open, setOpen] = useState<string | null>(null)
  const vc = volCalendar
  if (!vc?.events || !vc?.assets) {
    return <div className="neu p-5 text-sm" style={{ color: 'var(--text-muted)' }}>{isEN ? 'Volatility table not computed yet.' : '波动表还没算出来，下次完整跑会生成。'}</div>
  }
  const A = vc.assets
  const evs = upcoming(vc)
  const dow = (d: string) => (isEN ? DOW_EN : DOW_ZH)[new Date(d + 'T12:00:00Z').getUTCDay()]

  return (
    <div className="space-y-6">
      {/* ── 第一步：未来的大日子 ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2 px-1">
          <h2 className="text-sm font-bold">{isEN ? 'Big days ahead' : '未来的大日子'}</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {isEN ? 'US · next 90 days · median, not average' : '美国 · 未来 90 天 · 中位数，不是平均'}
          </span>
        </div>
        {!evs.length && <div className="neu p-4 text-xs" style={{ color: 'var(--text-muted)' }}>{isEN ? 'No tracked event in the next 90 days.' : '未来 90 天没有在表里的事件。'}</div>}
        <div className="space-y-2.5">
          {evs.map(e => {
            const ev = vc.events[e.type]; const s = say(ev.ratio, A); const t = tone(s.kind === 'fire' ? 1.6 : s.kind === 'warn' ? 1.3 : 1)
            const key = `${e.date}|${e.type}`; const isOpen = open === key
            return (
              <div key={key} className="neu px-3.5 py-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="font-num font-bold text-sm">{e.date.slice(5)}</span>
                  <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{dow(e.date)}</span>
                  <span className="text-sm font-medium flex-1 min-w-0">{isEN ? ev.label_en : ev.label}
                    {/* 原标题只在和人话名不重叠时才带（「非农 非农就业报告」这种就省掉） */}
                    {(() => { const t = e.title.replace(/★/g, '').trim(); return t && !t.startsWith(ev.label) && t !== ev.label
                      ? <span className="text-[11px] ml-1.5" style={{ color: 'var(--text-muted)' }}>{t}</span> : null })()}
                  </span>
                  <span className="badge" style={{ background: t.bg, color: t.text }}><span className="dot" style={{ background: t.fill }} />{s.pill}</span>
                </div>
                <div className="flex gap-2 items-start mt-1.5 text-[13px] leading-relaxed" style={{ color: s.kind === 'mute' ? 'var(--text-muted)' : 'var(--text)' }}>
                  <button
                    onClick={() => setOpen(isOpen ? null : key)}
                    aria-expanded={isOpen}
                    aria-label={isEN ? 'show all six' : '看六个标的'}
                    className="flex-shrink-0 rounded-full text-[11px] leading-none"
                    style={{ width: 18, height: 18, border: '1.5px solid var(--text-muted)', color: 'var(--text-muted)', marginTop: 2, background: isOpen ? 'var(--accent-soft)' : 'transparent' }}
                  >?</button>
                  <span>{s.text}</span>
                </div>
                {isOpen && (
                  <div className="neu-inset-sm px-3 py-2.5 mt-2">
                    <Strip ratio={ev.ratio} assets={A} />
                    <div className="text-[10.5px] mt-2 leading-snug" style={{ color: 'var(--text-muted)' }}>
                      {isEN
                        ? `Bar past the midline = busier than a normal day. Red ≥1.5×, pink 1.2–1.5×, grey ≈ normal, blue = quieter. ${ev.n} such days since ${vc.window.start}.`
                        : `条越过中线 = 比平常动得大。红 ≥1.5 倍，粉 1.2–1.5，灰 = 差不多，蓝 = 比平常还安静。${vc.window.start} 起共 ${ev.n} 个这种日子。`}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── 第二步：单个标的 ── */}
      <section>
        <div className="flex items-baseline justify-between mb-2 px-1">
          <h2 className="text-sm font-bold">{isEN ? 'Each asset' : '每个标的通常动多少'}</h2>
          <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>{isEN ? 'size only, not direction' : '不分涨跌，只看幅度'}</span>
        </div>
        <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
          {ORDER.filter(k => A[k]).map(k => {
            const a = A[k]
            const days = Object.entries(vc.events as Record<string, any>)
              .filter(([, e]) => e.ratio?.[k] != null)
              .map(([ek, e]) => ({ ek, label: isEN ? e.label_en : e.label, r: e.ratio[k] as number }))
              .sort((x, y) => y.r - x.r)
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
                    {days.map(d => {
                      const t = tone(d.r); const strong = d.r >= 1.2 || d.r <= 0.7
                      return [
                        <span key={d.ek + 'l'} style={{ color: strong ? t.text : 'var(--text-muted)' }}>{d.label}</span>,
                        <Bar key={d.ek + 'b'} r={d.r} />,
                        <span key={d.ek + 'v'} style={{ color: strong ? t.text : 'var(--text-muted)', fontWeight: strong ? 700 : 400 }}>{d.r}×</span>,
                      ]
                    })}
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
          {isEN
            ? `${vc.window.start} → ${vc.window.end}, ${vc.n_baseline_days} normal days. Medians: the middle is small, the tail is fat.`
            : `${vc.window.start} → ${vc.window.end}，平常日子 ${vc.n_baseline_days} 天。都是中位数：中间小，尾巴肥。`}
          {A.gold?.max_event_day?.FOMC != null && (isEN
            ? ` Gold's biggest FOMC-day move was ${A.gold.max_event_day.FOMC}%.`
            : ` 议息日黄金最大动过 ${A.gold.max_event_day.FOMC}%。`)}
          {isEN ? ' Recomputed weekly.' : ' 每周自动重算。'}
        </div>
      </section>
    </div>
  )
}
