import { useEffect, useMemo, useState } from 'react'
import { isEN, t } from '../i18n'
import { econEvents, econAsOf, econFFStatus, genAt } from '../data/live'
import type { EconEvent } from '../data/live'

/** 双时钟：中国 + 美东 实时时间（月-日 时:分:秒），秒级刷新 */
function DualClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat(isEN ? 'en-US' : 'zh-CN', {
      timeZone: tz, month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    }).format(now)
  let localTz = ''
  try { localTz = Intl.DateTimeFormat().resolvedOptions().timeZone } catch {}
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 notranslate">
      <span className="font-num text-sm" style={{ color: 'var(--text)' }}>
        🇨🇳 {t('cn_time')} <b>{fmt('Asia/Shanghai')}</b>
      </span>
      <span className="font-num text-sm" style={{ color: 'var(--text)' }}>
        🇺🇸 {t('us_time')} <b>{fmt('America/New_York')}</b>
      </span>
      {localTz && (
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {t('your_tz')}: {localTz}
        </span>
      )}
    </div>
  )
}

const FLAG: Record<string, string> = {
  USD: '🇺🇸', CNY: '🇨🇳', JPY: '🇯🇵', EUR: '🇪🇺', GBP: '🇬🇧', All: '🌐',
}
const CTRY: Record<string, [string, string]> = {
  USD: ['美国', 'US'], CNY: ['中国', 'CN'], JPY: ['日本', 'JP'],
  EUR: ['欧元区', 'EU'], GBP: ['英国', 'UK'], All: ['全球', 'Global'],
}

/** 一条事件 */
function EventRow({ e, open, onToggle }: { e: EconEvent; open: boolean; onToggle: () => void }) {
  const d = new Date(e.datetime)
  // 本地时区显示（国内用户即北京时间），另标美东供对照
  const local = new Intl.DateTimeFormat(isEN ? 'en-US' : 'zh-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  const et = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d)
  // 本地就是美东时不重复显示
  let localIsET = false
  try { localIsET = Intl.DateTimeFormat().resolvedOptions().timeZone === 'America/New_York' } catch {}
  const past = d.getTime() < Date.now()
  // 超预期/不及预期：市场交易的是"实际 vs 预期"的差，不是绝对水位
  // （CPI 3.6% 在预期3.8%时是利好——只看绝对值会读反）
  const num = (s?: string | null) => {
    if (!s) return null
    const m = String(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/)
    if (!m) return null
    let v = parseFloat(m[0])
    if (/^-|^\D*-/.test(String(s).trim())) v = -Math.abs(v)
    if (/[Kk]$/.test(String(s).trim())) v = v            // K 单位两边一致，不换算
    if (/[Mm]$/.test(String(s).trim())) v = v * 1000
    return v
  }
  const a = num(e.actual), f = num(e.forecast)
  const beat = a != null && f != null
    ? (Math.abs(a - f) < 1e-9 ? 0 : (a > f ? 1 : -1))
    : 0
  const impColor = e.importance >= 3 ? 'var(--st-fire-text)'
    : e.importance === 2 ? 'var(--st-warn-text)' : 'var(--text-muted)'
  const hasDetail = !!(e.note || e.chain || e.title_en !== e.title)

  return (
    <div style={{ opacity: past ? 0.5 : 1 }}>
      <button
        onClick={hasDetail ? onToggle : undefined}
        className="w-full text-left neu-sm px-3 py-2.5 flex items-start gap-2.5"
        style={{ cursor: hasDetail ? 'pointer' : 'default' }}
      >
        {/* 时间 */}
        <div className="flex-shrink-0 w-14 pt-0.5">
          <div className="font-num text-sm font-bold notranslate" style={{ color: 'var(--text)' }}>
            {local}
          </div>
          {!localIsET && (
            <div className="font-num text-xs notranslate" style={{ color: 'var(--text-muted)' }}>
              {et} ET
            </div>
          )}
        </div>

        {/* 主体 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="notranslate">{FLAG[e.country] ?? '🌐'}</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {(CTRY[e.country] ?? [e.country, e.country])[isEN ? 1 : 0]}
            </span>
            <span className="font-num text-xs" style={{ color: impColor }}>
              {'★'.repeat(e.importance)}
            </span>
            {e.estimated && (
              <span className="text-xs px-1.5 rounded" style={{
                backgroundColor: 'var(--st-mute-bg)', color: 'var(--st-mute-text)',
              }}>
                {isEN ? 'est.' : '预计'}
              </span>
            )}
            {e.actual != null && beat !== 0 && (
              <span className="text-xs px-1.5 rounded notranslate" style={{
                backgroundColor: beat > 0 ? 'var(--st-ok-bg)' : 'var(--st-fire-bg)',
                color: beat > 0 ? 'var(--st-ok-text)' : 'var(--st-fire-text)',
              }}>
                {beat > 0 ? (isEN ? 'above est.' : '超预期') : (isEN ? 'below est.' : '不及预期')}
              </span>
            )}
          </div>
          <div className="text-sm font-medium leading-snug mt-0.5" style={{ color: 'var(--text)' }}>
            {isEN ? e.title_en : e.title}
          </div>
        </div>

        {/* 实际 / 预期 / 前值。实际值来自我们自己的官方序列，发布后自动补上 */}
        <div className="flex-shrink-0 text-right">
          {e.actual != null && (
            <div className="font-num text-sm font-bold notranslate"
              title={`${isEN ? 'actual' : '实际'} · ${e.actual_src ?? ''} · ${e.actual_as_of ?? ''}`}
              style={{ color: beat === 0 ? 'var(--text)' : beat > 0 ? 'var(--green)' : 'var(--red)' }}>
              {e.actual}
            </div>
          )}
          {e.forecast != null && (
            <div className={`font-num notranslate ${e.actual != null ? 'text-xs' : 'text-sm'}`}
              style={{ color: e.actual != null ? 'var(--text-muted)' : 'var(--accent)' }}>
              {isEN ? 'est ' : '预 '}{e.forecast}
            </div>
          )}
          {e.previous != null && (
            <div className="font-num text-xs notranslate" style={{ color: 'var(--text-muted)' }}>
              {isEN ? 'prev ' : '前 '}{e.previous}
            </div>
          )}
          {e.forecast == null && e.previous == null && e.actual == null && (
            <div className="text-xs" style={{ color: 'var(--text-muted)' }}>—</div>
          )}
        </div>
        {hasDetail && (
          <span className="text-xs flex-shrink-0 pt-1" style={{ color: 'var(--text-muted)' }}>
            {open ? '▲' : '▼'}
          </span>
        )}
      </button>

      {open && hasDetail && (
        <div className="neu-inset-sm mx-2 mt-1 px-3 py-2 text-xs space-y-1"
          style={{ color: 'var(--text-muted)' }}>
          {e.note && (
            <div>
              <span className="font-medium" style={{ color: 'var(--text)' }}>
                {isEN ? 'What to watch: ' : '看什么：'}
              </span>{e.note}
            </div>
          )}
          {e.chain && (
            <div>
              <span className="font-medium" style={{ color: 'var(--text)' }}>
                {isEN ? 'Feeds chain: ' : '接哪条链：'}
              </span>{e.chain}
            </div>
          )}
          <div className="notranslate" style={{ opacity: 0.75 }}>
            {e.title_en} · {e.org}
          </div>
        </div>
      )}
    </div>
  )
}

export default function CalendarPage() {
  const [minImp, setMinImp] = useState(2)
  const [ctry, setCtry] = useState<string>('all')
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(
    () => econEvents.filter(e =>
      e.importance >= minImp && (ctry === 'all' || e.country === ctry)),
    [minImp, ctry])

  // 按"本地日期"分组（国内用户即北京日期）
  const days = useMemo(() => {
    const g: Record<string, EconEvent[]> = {}
    for (const e of filtered) {
      const d = new Date(e.datetime)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      ;(g[key] ??= []).push(e)
    }
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b))
  }, [filtered])

  const todayKey = (() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  const WEEK = isEN ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    : ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

  return (
    <div className="space-y-3">
      <div className="neu p-4">
        <div className="font-bold" style={{ color: 'var(--accent)' }}>
          {t('cal_page')}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {t('cal_page_hint')}
        </div>
        <DualClock />
      </div>

      {/* 数据层降级提示：FF层挂了只影响"预期/前值"，日期层仍在 */}
      {econFFStatus && econFFStatus !== 'ok' && (
        <div className="neu-inset p-3 text-xs" style={{ color: 'var(--st-warn-text)' }}>
          {econFFStatus.startsWith('fallback_cache')
            ? (isEN
                ? `Forecast/previous values come from a cached copy (${econFFStatus.match(/\(([^)]+)\)/)?.[1] ?? ''}); dates are current.`
                : `预期/前值取自缓存副本（${econFFStatus.match(/\(([^)]+)\)/)?.[1] ?? ''}），日期是最新的。`)
            : (isEN
                ? 'Forecast/previous values are temporarily unavailable (source rate-limited). Dates below are still official.'
                : '预期/前值暂时取不到（数据源限流），下面的日期仍是官方日程。')}
        </div>
      )}

      {/* 筛选 */}
      <div className="neu p-3 flex flex-wrap gap-2 items-center">
        <div className="neu-sm flex gap-1 p-1">
          {([[3, isEN ? '★★★ only' : '只看三星'], [2, isEN ? '★★+' : '两星以上'], [1, isEN ? 'All' : '全部']] as const).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setMinImp(v)}
              className="px-2.5 py-1 text-xs rounded-xl transition-all"
              style={minImp === v
                ? { backgroundColor: 'var(--accent)', color: '#fff' }
                : { color: 'var(--text-muted)' }}
            >
              {l}
            </button>
          ))}
        </div>
        <div className="neu-sm flex gap-1 p-1 flex-wrap">
          {(['all', 'USD', 'CNY', 'EUR', 'JPY', 'GBP'] as const).map(c => (
            <button
              key={c}
              onClick={() => setCtry(c)}
              className="px-2.5 py-1 text-xs rounded-xl transition-all notranslate"
              style={ctry === c
                ? { backgroundColor: 'var(--accent)', color: '#fff' }
                : { color: 'var(--text-muted)' }}
            >
              {c === 'all' ? (isEN ? 'All' : '全部') : `${FLAG[c]} ${(CTRY[c] ?? [c, c])[isEN ? 1 : 0]}`}
            </button>
          ))}
        </div>
        <span className="text-xs ml-auto" style={{ color: 'var(--text-muted)' }}>
          {filtered.length} {isEN ? 'events' : '条'}
        </span>
      </div>

      {/* 日历主体 */}
      {days.length === 0 ? (
        <div className="neu p-6 text-center text-sm" style={{ color: 'var(--text-muted)' }}>
          {isEN ? 'No events match the filter.' : '当前筛选下没有事件'}
        </div>
      ) : (
        days.map(([day, evs]) => {
          const d = new Date(day + 'T12:00:00')
          const isToday = day === todayKey
          return (
            <section key={day}>
              <div className="flex items-baseline gap-2 mb-2 px-1">
                <span className="font-num text-sm font-bold"
                  style={{ color: isToday ? 'var(--accent)' : 'var(--text)' }}>
                  {day.slice(5)}
                </span>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {WEEK[d.getDay()]}
                </span>
                {isToday && (
                  <span className="text-xs px-2 rounded-full" style={{
                    backgroundColor: 'var(--st-ok-bg)', color: 'var(--st-ok-text)',
                  }}>
                    {isEN ? 'today' : '今天'}
                  </span>
                )}
              </div>
              <div className="neu p-3 space-y-2">
                {evs.map((e, i) => {
                  const id = `${day}_${i}`
                  return (
                    <EventRow
                      key={id} e={e}
                      open={openId === id}
                      onToggle={() => setOpenId(openId === id ? null : id)}
                    />
                  )
                })}
              </div>
            </section>
          )
        })
      )}

      <div className="text-xs text-center pb-4" style={{ color: 'var(--text-muted)' }}>
        {isEN
          ? `Times shown in your local timezone · forecast/previous from ForexFactory, US dates from FRED official schedule, China dates estimated from published conventions · data as of ${econAsOf}`
          : `时间已换成你的本地时区 · 预期/前值来自ForexFactory，美国日期取FRED官方日程，中国日期按公开惯例推算(标"预计") · 数据更新于 ${econAsOf}`}
        {' · '}{isEN ? 'built' : '构建'} {genAt}
      </div>
    </div>
  )
}
