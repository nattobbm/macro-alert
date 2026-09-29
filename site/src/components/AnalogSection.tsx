import { useState } from 'react'
import { analogRates } from '../data/live'
import { isEN } from '../i18n'

/* 「要崩没崩」（2026-09-29 建）
   Momo：为什么 30 年利率冲新高、股票黄金一起跌、美元涨，却没有接着崩？用的什么办法？是不是根本不可能崩？
   她的纠正：推理不许推到一半——决策者 → 目的 → 情绪 → 行为 → 订单 → 波动 → 市场怎么接受 → 修复 → 修复留下了什么。
   数据：knowledge/analog_rates.yaml（每条带出处，找不到出处的不进）+ core/analog.py 每天查今天中没中。
   呈现：先一句结论，再今天的状态，细节全部折叠（375 宽验收）。 */

type Src = { label: string; url?: string }
const Sources = ({ s }: { s?: Src[] }) =>
  s?.length ? (
    <div className="text-[10.5px] mt-1 leading-snug" style={{ color: 'var(--text-muted)' }}>
      {isEN ? 'Sources: ' : '出处：'}
      {s.map((x, i) => (
        <span key={i}>
          {i > 0 && '；'}
          {x.url ? <a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{x.label}</a> : x.label}
        </span>
      ))}
    </div>
  ) : null

const Status = ({ s }: { s?: string }) => {
  if (!s) return null
  // 胶囊只放"纠正 / 部分 / 已核实 / 进行中"几个字，说明另起一行（2026-09-29：长文字放胶囊里把手机页面撑到 480 宽）
  const i = s.search(/[：（]/)
  const tag = i > 0 ? s.slice(0, i) : s
  const note = i > 0 ? s.slice(i + (s[i] === '：' ? 1 : 0)) : ''
  const ok = tag.startsWith('已核实'); const bad = tag.startsWith('未找到') || tag.startsWith('纠正')
  return (
    <div className="text-[12px] leading-snug">
      <span className="text-[10px] px-1.5 rounded-full mr-1.5 whitespace-nowrap" style={{
        background: ok ? 'var(--st-ok-bg)' : bad ? 'var(--st-warn-bg)' : 'var(--bg2)',
        color: ok ? 'var(--st-ok-text)' : bad ? 'var(--st-warn-text)' : 'var(--text-muted)',
      }}>{tag}</span>
      {note && <span style={{ color: 'var(--text-muted)' }}>{note}</span>}
    </div>
  )
}

function Fold({ title, children, defaultOpen = false }: { title: string; children: any; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="neu-sm">
      <button onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full text-left px-3.5 py-2.5 flex items-center justify-between gap-2 text-sm font-medium"
        style={{ color: 'var(--text)' }}>
        <span>{title}</span><span className="text-xs" style={{ color: 'var(--text-muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && <div className="px-3.5 pb-3 text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{children}</div>}
    </div>
  )
}

const pct = (v: number | null | undefined) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`

export default function AnalogSection() {
  const [openEp, setOpenEp] = useState<string | null>(null)
  const a = analogRates
  const kb = a?.kb
  if (!kb) return null
  const t = a?.today
  const PART: [string, string][] = [
    ['y30_new_high', '30年利率一年新高'], ['y30_up_4bp', '当天+4个基点'], ['spx_down', '标普跌'], ['gold_down', '黄金跌'], ['usd_up', '美元涨'],
  ]

  return (
    <section>
      <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
        {kb.title}
      </h2>
      <div className="neu p-4 space-y-3">
        {/* 一句结论 */}
        <div className="text-[14px] leading-relaxed font-medium" style={{ color: 'var(--text)' }}>{kb.answer}</div>

        {/* 今天中没中 */}
        {t && (
          <div className="neu-inset-sm px-3 py-2.5 text-[13px] leading-relaxed">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-num font-bold">{t.asof.slice(5)}</span>
              <span className="badge" style={{ background: t.met ? 'var(--st-fire-bg)' : 'var(--bg2)', color: t.met ? 'var(--st-fire-text)' : 'var(--text-muted)' }}>
                {t.met ? '又是这种日子' : '今天不是这种日子'}
              </span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[12px]">
              {PART.map(([k, l]) => (
                <span key={k} style={{ color: t.parts?.[k] ? 'var(--text)' : 'var(--text-muted)' }}>{t.parts?.[k] ? '✓' : '✗'} {l}</span>
              ))}
            </div>
            <div className="mt-1 text-[12px] font-num" style={{ color: 'var(--text-muted)' }}>
              30年 {t.y30}%（{t.y30_chg_bp > 0 ? '+' : ''}{t.y30_chg_bp}bp，一年高 {t.y30_hi250}%）· 标普 {pct(t.spx_pct)} · 黄金 {pct(t.gold_pct)} · 美元 {pct(t.usd_pct)}
            </div>
            {t.recent_hits?.length > 0 && (
              <div className="mt-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>最近命中：{t.recent_hits.slice(-6).map((d: string) => d.slice(2)).join('、')}</div>
            )}
          </div>
        )}

        {/* 历史上这种日子之后 */}
        {kb.stats && <div className="text-[13px] leading-relaxed" style={{ color: 'var(--text)' }}>{kb.stats}</div>}

        {/* 每一段 */}
        <div className="space-y-1.5">
          {(kb.episodes ?? []).map((e: any) => {
            const open = openEp === e.id
            return (
              <div key={e.id} className="neu-sm">
                <button onClick={() => setOpenEp(open ? null : e.id)} aria-expanded={open}
                  className="w-full text-left px-3 py-2 grid gap-x-2 items-baseline"
                  style={{ gridTemplateColumns: '64px 1fr auto', color: 'var(--text)' }}>
                  <span className="font-num text-[12px] font-bold">{e.label}</span>
                  <span className="text-[12.5px] leading-snug min-w-0">{e.fix_short}</span>
                  <span className="font-num text-[12px] text-right" style={{ color: e.spx20 != null && e.spx20 < 0 ? 'var(--red)' : 'var(--text-muted)' }}>
                    {e.spx20 != null ? pct(e.spx20) : '进行中'}
                  </span>
                </button>
                {open && (
                  <div className="px-3 pb-2.5 text-[12.5px] leading-relaxed space-y-1">
                    <div className="font-num text-[11.5px]" style={{ color: 'var(--text-muted)' }}>
                      30年 {e.y30}% · 之后20天标普 {pct(e.spx20)} · 20天内最深 {pct(e.dd20)}{e.peak_days != null ? ` · 之后 60 天里利率最高在${e.peak_days === 0 ? '当天' : `第 ${e.peak_days} 天`}` : ''}
                    </div>
                    {e.trigger && <div><b>那天为什么跌：</b>{e.trigger}</div>}
                    {e.fix && <div><b>谁、用了什么办法：</b>{e.fix}</div>}
                    {e.fear && <div><b>打在哪种害怕上：</b>{e.fear}</div>}
                    {e.left && <div><b>留下了什么：</b>{e.left}</div>}
                    <Status s={e.status} />
                    <Sources s={e.sources} />
                  </div>
                )}
              </div>
            )
          })}
          <div className="text-[10.5px] px-1" style={{ color: 'var(--text-muted)' }}>{kb.episodes_note}</div>
        </div>

        {/* 三种类型 */}
        {kb.types && (
          <Fold title="崩和不崩的分界：三种问题" defaultOpen>
            <div className="space-y-2.5">
              {kb.types.map((x: any) => (
                <div key={x.name}>
                  <div className="font-bold">{x.name}<span className="font-normal ml-1.5" style={{ color: 'var(--text-muted)' }}>{x.outcome}</span></div>
                  <div>{x.why}</div>
                  {x.examples && <div className="text-[12px]" style={{ color: 'var(--text-muted)' }}>例子：{x.examples}</div>}
                  <Sources s={x.sources} />
                </div>
              ))}
            </div>
          </Fold>
        )}

        {/* 我们自己的数据 */}
        {kb.our_data && (
          <Fold title="是不是根本不可能崩：我们自己的数据">
            <ul className="space-y-1.5 list-disc pl-4">{kb.our_data.map((x: any, i: number) => <li key={i}>{x.text}<span className="text-[11px] ml-1" style={{ color: 'var(--text-muted)' }}>（{x.src}）</span></li>)}</ul>
          </Fold>
        )}

        {/* 完整一条链 */}
        {kb.full_chain && (
          <Fold title={kb.full_chain.title}>
            <div className="grid gap-x-3 gap-y-1.5" style={{ gridTemplateColumns: 'auto 1fr' }}>
              {kb.full_chain.rows.map((r: any, i: number) => [
                <span key={i + 'k'} className="font-bold whitespace-nowrap text-[12px] pt-[1px]">{r.step}</span>,
                <span key={i + 'v'}>{r.text}</span>,
              ])}
            </div>
            <Sources s={kb.full_chain.sources} />
          </Fold>
        )}

        {/* 互联网泡沫 */}
        {kb.dotcom && (
          <Fold title={kb.dotcom.title}>
            <ul className="space-y-1.5 list-disc pl-4">{kb.dotcom.points.map((p: any, i: number) => (
              <li key={i}>{p.text}<Sources s={p.sources} /></li>
            ))}</ul>
          </Fold>
        )}

        {/* 这一次 */}
        {kb.now && (
          <Fold title={kb.now.title} defaultOpen>
            <div className="mb-2">{kb.now.why}</div>
            <div className="space-y-2">
              {kb.now.menu.map((m: any, i: number) => (
                <div key={i} className="neu-inset-sm px-3 py-2">
                  <div className="flex items-baseline gap-2 flex-wrap"><b>{m.who}</b><span className="text-[12px]" style={{ color: 'var(--text-muted)' }}>{m.when}</span></div>
                  <div>{m.tool}</div>
                  {m.fear && <div className="text-[12px]"><span style={{ color: 'var(--text-muted)' }}>打在：</span>{m.fear}</div>}
                  {m.left && <div className="text-[12px]"><span style={{ color: 'var(--text-muted)' }}>留下：</span>{m.left}</div>}
                  <Sources s={m.sources} />
                </div>
              ))}
            </div>
            {kb.now.note && <div className="text-[11px] mt-2" style={{ color: 'var(--text-muted)' }}>{kb.now.note}</div>}
          </Fold>
        )}

        {/* 艾丽 */}
        {kb.alie && (
          <Fold title={kb.alie.title}>
            <div className="mb-1.5">{kb.alie.summary}</div>
            <ul className="space-y-1 list-disc pl-4">{kb.alie.items.map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
          </Fold>
        )}

        {kb.open && (
          <div className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            <b>还没查清的：</b>{kb.open.join('；')}
          </div>
        )}
      </div>
    </section>
  )
}
