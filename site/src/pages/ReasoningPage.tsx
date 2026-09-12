import { useState } from 'react'
import { chains, verdicts, predictions, rateProbabilities, news, calEvents, showdown, marketOdds } from '../data/live'
import { t as tr, isEN } from '../i18n'

const STATUS_META = {
  fire:    { dot: 'var(--st-fire)', label: tr('breached'), color: 'var(--st-fire-text)' },
  warning: { dot: 'var(--st-warn)', label: tr('warning_w'),  color: 'var(--st-warn-text)' },
  ok:      { dot: 'var(--st-ok)',   label: tr('ok_w'),  color: 'var(--st-ok-text)' },
  // 2026-09-07 实测：--accent 浅蓝当 12px 字色，气球村内凹底上只有 2.1 对比度。字改用本主题的深蓝 --st-ok-text（4.4），点不变
  fact:    { dot: 'var(--accent)',  label: tr('v_fact'),  color: 'var(--st-ok-text)' },
}

const VERDICT_META = {
  true:    { dot: 'var(--st-ok)',   label: tr('v_true'), color: 'var(--st-ok-text)' },
  false:   { dot: 'var(--st-fire)', label: tr('v_false'), color: 'var(--st-fire-text)' },
  pending: { dot: 'var(--st-mute)', label: tr('v_pending'), color: 'var(--st-mute-text)' },
  testing: { dot: 'var(--accent)',  label: tr('v_testing'), color: 'var(--st-ok-text)' },   // 2026-09-07 字色改深蓝（浅蓝当字 2.1）
  fact:    { dot: 'var(--st-mute)', label: tr('v_fact'), color: 'var(--st-mute-text)' },
}

const CHAIN_COLORS = [
  '#5b9eb8', '#6bb89a', '#d4a848', '#e07878', '#a088c0', '#88b888',
]

export default function ReasoningPage() {
  const [expandedChain, setExpandedChain] = useState<string | null>(null)
  const [expandedVerdict, setExpandedVerdict] = useState<string | null>(null)
  const [showAllNews, setShowAllNews] = useState(false)
  const [expandedPred, setExpandedPred] = useState<string | null>(null)

  const sorted = [...chains].sort((a, b) => b.heat - a.heat)

  return (
    <div className="space-y-6">

      {/* ── Logic Chains ─────────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          {tr('chains_title')}
          <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>{isEN ? ` (${tr('chains_hint')})` : `（${tr('chains_hint')}）`}</span>
        </h2>
        <div className="space-y-4">
          {sorted.map((chain, ci) => {
            const color = CHAIN_COLORS[ci % CHAIN_COLORS.length]
            const isExpanded = expandedChain === chain.id
            return (
              <div key={chain.id} className="neu p-4">
                {/* Chain header：标题独占一行，热度+失效条件下移到第二行（手机端标题不被挤） */}
                <div className="flex gap-3 mb-3">
                  <div
                    className="w-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm leading-snug" style={{ color: 'var(--text)' }}>
                      {chain.title}
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      {/* Heat badge */}
                      {/* 用真实构成代替"热度100"：越线几个、快到几个，一眼可比 */}
                      <div
                        className="font-num text-xs font-bold px-2.5 py-1 rounded-full"
                        style={{
                          backgroundColor: (chain.nCrossed ?? 0) >= 2 ? 'var(--st-fire-bg)' : (chain.nCrossed ?? 0) >= 1 ? 'var(--st-warn-bg)' : 'var(--st-ok-bg)',
                          color: (chain.nCrossed ?? 0) >= 2 ? 'var(--st-fire-text)' : (chain.nCrossed ?? 0) >= 1 ? 'var(--st-warn-text)' : 'var(--st-ok-text)',
                        }}
                      >
                        {isEN
                          ? `${chain.nCrossed ?? 0} crossed · ${chain.nNear ?? 0} near`
                          : `越线${chain.nCrossed ?? 0} · 快到${chain.nNear ?? 0}`}
                      </div>
                      {/* 前提被推翻：链条"没穿线"和"根基没了"是两回事，必须分开显示 */}
                      {(chain.nBroken ?? 0) > 0 && (
                        <div className="text-xs px-2.5 py-1 rounded-full"
                          style={{ backgroundColor: 'var(--st-fire-bg)', color: 'var(--st-fire-text)' }}>
                          {isEN ? `${chain.nBroken} premise broken` : `前提已翻${chain.nBroken}`}
                        </div>
                      )}
                      {chain.premise && (
                        <div className="text-xs px-2 py-1 rounded-full"
                          style={{ backgroundColor: 'var(--bg2)', color: 'var(--text-muted)' }}>
                          {isEN ? 'premises ' : '前提成立 '}{chain.premise}
                        </div>
                      )}
                      <span className="flex-1" />
                      {/* 展开/收起：一次只开一条。
                          折叠态只留"标题+这条链现在什么状况"，节点和失效条件都收起来。
                          原来节点链一直摊开，6条链在手机上要滑十几屏，
                          等于把主线埋在细节里——工具网站要先给主题，细节由人点 */}
                      <button
                        className="neu-btn px-3 py-1 text-xs flex-shrink-0"
                        style={{ color: 'var(--accent)' }}
                        onClick={() => setExpandedChain(isExpanded ? null : chain.id)}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded ? (isEN ? 'collapse ▲' : '收起 ▲')
                                    : (isEN ? `${chain.nodes.length} steps ▼` : `看${chain.nodes.length}步推理 ▼`)}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 以下全部属于"细节"，只在展开时出现 */}
                {isExpanded && (
                  <div
                    className="neu-inset-sm px-4 py-2 mb-3 text-xs"
                    style={{ color: 'var(--text-muted)' }}
                  >
                    何时失效：{chain.invalidation}
                  </div>
                )}
                {/* 节点链：手机竖排（↓），桌面横排（→）。
                    原来一律横排定宽160px，375px屏只看得到2个节点——
                    "A→B→C"的C看不到，等于这条链没讲完。链最长有9个节点，
                    所以手机版把卡片压成一行（左边名字、右边读数），别堆成9个大方块 */}
                {isExpanded && (
                <div className="sm:overflow-x-auto pb-2">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:min-w-max">
                    {chain.nodes.map((node, ni) => {
                      const meta = STATUS_META[node.status]
                      return (
                        <div key={ni} className="flex flex-col sm:flex-row sm:items-center gap-2">
                          {/* Node card */}
                          <div
                            className="neu-inset-sm px-4 py-3 w-full sm:w-40 flex-shrink-0
                                       flex sm:block items-center gap-3"
                            title={node.term}
                          >
                            <div className="flex-1 min-w-0 sm:flex-none">
                              <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                                {/* 前提已翻：这个前提不是"还没到"，是明确反了——
                                    金融抑制链假设"市场不信加息"，实际71.5%，根基没了 */}
                                <span className="dot" style={{
                                  backgroundColor: node.premiseBroken ? 'var(--st-fire)' : meta.dot }} />
                                <span className="text-xs font-medium" style={{
                                  color: node.premiseBroken ? 'var(--st-fire-text)' : meta.color }}>
                                  {node.premiseBroken ? (isEN ? 'premise broken' : '前提已翻')
                                    : node.nearSuppressed
                                      ? (isEN ? 'quiet · other exit crossed' : '安静 · 另一边已破')
                                      : meta.label}
                                </span>
                                {(node.sharedWith ?? 0) > 0 && (
                                  <span className="text-xs px-1 rounded"
                                    style={{ backgroundColor: 'var(--bg2)', color: 'var(--text-muted)', fontSize: 10 }}
                                    title={isEN ? 'this reading also drives other chains'
                                               : '同一个读数也是其他链的节点——它动，那几条链一起动'}>
                                    共用{node.sharedWith}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs font-medium leading-tight" style={{ color: 'var(--text)' }}>
                                {node.label}
                              </div>
                              <div className="text-xs mt-1 opacity-60 hidden sm:block"
                                style={{ color: 'var(--text-muted)' }}>
                                {node.term}
                              </div>
                            </div>
                            <div className="text-right sm:text-left flex-shrink-0 sm:mt-1">
                              <div className="font-num text-sm font-bold" style={{ color: meta.color }}>
                                {node.value}
                              </div>
                              {node.threshold && (
                                <div className="text-xs mt-0.5 whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                                  线: {node.threshold}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* 箭头：手机朝下、桌面朝右 */}
                          {ni < chain.nodes.length - 1 && (
                            <div className="text-lg flex-shrink-0 self-center sm:self-auto leading-none"
                              style={{ color }}>
                              <span className="sm:hidden">↓</span>
                              <span className="hidden sm:inline">→</span>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* ── Verdict Library ──────────────────────────── */}
      <section>
        <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
          {tr('verdicts_title')}
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
                  <span className="dot flex-shrink-0" style={{ backgroundColor: meta.dot }} />
                  <span
                    className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0"
                    style={{ backgroundColor: 'var(--bg2)', color: meta.color }}
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
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>证据：</span>{v.evidence}</div>
                    <div><span className="font-medium" style={{ color: 'var(--text)' }}>来源：</span>{v.source}</div>
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
          {tr('pred_title')}
        </h2>
        <div className="neu p-4 space-y-4">
          {/* Rate probability comparison */}
          <div className="neu-inset p-4 space-y-3">
            <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
              {/* 2026-09-07 修：原写死「3月FOMC维持不变概率」——月份和方向都是旧的，改用 i18n 的 odds_title */}
              {tr('odds_title')}
            </div>
            {rateProbabilities.map(r => (
              <div key={r.source}>
                <div className="flex justify-between items-baseline gap-2 text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  {/* 每条标出"哪天的数"。三个数并排却不说时点，旧读数会被当成分歧 */}
                  <span className="min-w-0">
                    {r.source}
                    {(r as any).ageText && (
                      <span style={{ opacity: (r as any).stale ? 1 : 0.75 }}>
                        {' · '}{(r as any).asOf}
                        {(r as any).stale ? ` ${(r as any).ageText}${isEN ? '' : '的旧读数'}` : ''}
                      </span>
                    )}
                  </span>
                  {/* 数字用正文色（绿/黄当 12px 字只有 1.6–1.9），来源色留给下面的色条 */}
                  <span className="font-num font-bold flex-shrink-0"
                        style={{ color: (r as any).stale ? 'var(--text-muted)' : 'var(--text)' }}>{r.prob}%</span>
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

          {/* 三方对照：同一件事，市场用钱押、我们用逻辑链判、博主用叙事说。到期一起记账。
              2026-09-12 建。市场栏从 marketOdds 现取，盘中轻量刷新会跟着更新；
              叙事和我们两栏来自完整跑（narrative_calls.yaml + predictions/open）。 */}
          {showdown.length > 0 && (
            <div className="neu-inset p-4 space-y-3">
              <div>
                <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>{tr('showdown_title')}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{tr('showdown_hint')}</div>
              </div>
              {showdown.map(s => {
                const pct = (v: any) => (v == null || Number.isNaN(+v)) ? '—' : `${Math.round(+v * 100)}%`
                const mo = marketOdds
                const hasMkt = s.market_ref === 'fomc_sep' && mo
                const oc = s.outcome
                const ocStyle = oc === 'hit' ? { bg: 'var(--st-ok-bg)', fg: 'var(--st-ok-text)' }
                  : oc === 'miss' ? { bg: 'var(--st-fire-bg)', fg: 'var(--st-fire-text)' }
                  : { bg: 'var(--st-mute-bg)', fg: 'var(--st-mute-text)' }
                const ocText = oc === 'hit' ? tr('sd_hit') : oc === 'miss' ? tr('sd_miss') : oc === 'void' ? tr('sd_void') : tr('sd_pending')
                const rankText = s.ours?.ranking
                  ? s.ours.ranking.split('>').map(k => k.trim()).map(k => s.ours!.labels?.[k] ?? k).join(' ＞ ')
                  : null
                // 市场行：加息那一档为主，有五档分布的再带上"维持"
                const mktRow = (label: string, o: any) => o && o.value != null ? (
                  <div key={label} className="flex justify-between gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>{label}{o.as_of ? ` · ${String(o.as_of).slice(5)}` : ''}</span>
                    <span className="font-num notranslate" style={{ color: 'var(--text)' }}>
                      {isEN ? 'hike ' : '加息 '}{pct(o.value)}
                      {o.dist?.hold != null && <span style={{ color: 'var(--text-muted)' }}> · {isEN ? 'hold ' : '维持 '}{pct(o.dist.hold)}</span>}
                    </span>
                  </div>
                ) : null
                return (
                  <div key={s.id} className="neu-inset-sm p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium" style={{ color: 'var(--text)' }}>
                        {s.event}
                        <span className="text-xs font-normal ml-2" style={{ color: 'var(--text-muted)' }}>{tr('sd_settles')} {s.settle_date}</span>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0" style={{ backgroundColor: ocStyle.bg, color: ocStyle.fg }}>{ocText}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-3 text-xs" style={{ lineHeight: 1.6 }}>
                      {/* 市场 */}
                      <div className="space-y-1">
                        <div className="font-medium" style={{ color: 'var(--st-ok-text)' }}>{tr('sd_market')}</div>
                        {hasMkt ? (
                          <>
                            {mktRow(isEN ? 'ZQ futures' : 'ZQ期货', mo.zq_auto)}
                            {mktRow('Polymarket', mo.polymarket)}
                            {mktRow('Kalshi', mo.kalshi)}
                          </>
                        ) : (
                          <div style={{ color: 'var(--text-muted)' }}>{tr('sd_no_market')}</div>
                        )}
                      </div>
                      {/* 我们 */}
                      <div className="space-y-1">
                        <div className="font-medium" style={{ color: 'var(--st-ok-text)' }}>{tr('sd_ours')}</div>
                        {s.ours ? (
                          <>
                            {rankText && <div className="font-medium" style={{ color: 'var(--text)' }}>{rankText}</div>}
                            {s.ours.signed_at && <div style={{ color: 'var(--text-muted)' }}>{tr('sd_signed')} {s.ours.signed_at}</div>}
                            {s.ours.reasoning && <div style={{ color: 'var(--text)' }}>「{s.ours.reasoning}」</div>}
                          </>
                        ) : (
                          <div style={{ color: 'var(--text-muted)' }}>—</div>
                        )}
                      </div>
                      {/* 叙事 */}
                      <div className="space-y-1">
                        <div className="font-medium" style={{ color: 'var(--st-ok-text)' }}>{tr('sd_narr')}</div>
                        <div style={{ color: 'var(--text-muted)' }}>{s.narrative.who} · {tr('sd_said_on')} {s.narrative.said_on}</div>
                        <div className="font-medium" style={{ color: 'var(--text)' }}>{s.narrative.judgment}</div>
                        {s.narrative.quote && <div style={{ color: 'var(--text-muted)' }}>「{s.narrative.quote}」</div>}
                        {s.narrative.criterion && <div style={{ color: 'var(--text-muted)' }}>{tr('sd_criterion')}：{s.narrative.criterion}</div>}
                      </div>
                    </div>
                    {s.settle_note && <div className="text-xs" style={{ color: 'var(--st-warn-text)' }}>{s.settle_note}</div>}
                  </div>
                )
              })}
              <div className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
                {isEN ? 'Market prices from each platform\'s public API, shown for reference only. This site does not trade.' : '市场价来自各平台公开接口，仅展示参照。本站不做交易。'}
              </div>
            </div>
          )}

          {/* Prediction list */}
          <div className="grid gap-2">
            {predictions.map(p => (
              <div
                key={p.id}
                className="neu-sm px-4 py-3 flex items-center gap-3"
                style={p.status === 'settled' ? { opacity: 0.7 } : {}}
              >
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: p.locked ? 'var(--st-ok-bg)' : 'var(--st-warn-bg)',
                    color: p.locked ? 'var(--st-ok-text)' : 'var(--st-warn-text)',
                  }}
                >
                  {p.locked ? '已锁定' : '未锁定'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm" style={{ color: 'var(--text)' }}>{p.question}</div>
                  <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    结算: {p.settle_date}
                    {/* 签发内容：情景图卡签的是排序，概率单签的是概率 */}
                    {p.ranking && (
                      <span className="ml-2 font-num font-medium notranslate"
                        style={{ color: 'var(--st-ok-text)' }}>{p.ranking}</span>
                    )}
                    {p.probability != null && (
                      <span className="ml-2 font-num font-medium notranslate"
                        style={{ color: 'var(--st-ok-text)' }}>{(p.probability * 100).toFixed(0)}%</span>
                    )}
                    {p.result && <span className="ml-2 font-medium">{p.result}</span>}
                  </div>
                  {/* 签发后追加的证据：折叠态只给条数，点开才看。
                      排序锁死不动——这里让人看见"签了之后世界发生了什么"，不是改答案 */}
                  {!!p.evidence?.length && (
                    <button
                      className="text-xs mt-1"
                      style={{ color: 'var(--accent)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      onClick={() => setExpandedPred(expandedPred === p.id ? null : p.id)}
                    >
                      {isEN ? `${p.evidence.length} evidence since signing` : `签发后证据 ${p.evidence.length} 条`}
                      {expandedPred === p.id ? ' ▲' : ' ▼'}
                    </button>
                  )}
                  {expandedPred === p.id && p.evidence?.map((e, i) => (
                    <div key={i} className="neu-inset-sm px-3 py-2 mt-1.5 text-xs" style={{ lineHeight: 1.6 }}>
                      <div style={{ color: 'var(--text-muted)' }}>{e.at} · {e.who}</div>
                      <div style={{ color: 'var(--text)' }}>{e.what}</div>
                      {e.bearing && <div className="mt-1" style={{ color: 'var(--st-warn-text)' }}>{e.bearing}</div>}
                      {e.source && <div className="mt-0.5" style={{ color: 'var(--text-muted)', opacity: 0.7 }}>{isEN ? 'source: ' : '来源：'}{e.source}</div>}
                    </div>
                  ))}
                  {expandedPred === p.id && p.falsifiers && Object.keys(p.falsifiers).length > 0 && (
                    <div className="neu-inset-sm px-3 py-2 mt-1.5 text-xs" style={{ lineHeight: 1.6 }}>
                      <div style={{ color: 'var(--text-muted)' }}>{isEN ? 'what would change the weights (written before signing)' : '什么情况会改变权重（签发前写好的）'}</div>
                      {Object.entries(p.falsifiers).map(([k, v]) => (
                        <div key={k} style={{ color: 'var(--text)' }}><span className="font-num">{k}</span> {v}</div>
                      ))}
                    </div>
                  )}
                </div>
                <span
                  className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 self-start"
                  style={{
                    // 2026-09-07：白字压浅蓝 --accent 只有 2.6–3.0，底改本主题深蓝 --st-ok-text
                    backgroundColor: p.status === 'open' ? 'var(--st-ok-text)' : 'var(--text-muted)',
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
            官方消息流
            <span className="text-xs font-normal" style={{ color: 'var(--text-muted)' }}>
              共{news.length}条
            </span>
          </h2>
          {/* 默认只出6条。全量渲染时这一块占了整页44%的高度——
              新闻是背景板不是主线，不该比逻辑链还占地方 */}
          <div className="neu p-4 space-y-3">
            {(showAllNews ? news : news.slice(0, 6)).map(n => (
              <div key={n.id} className="neu-sm px-4 py-3">
                <div className="flex flex-wrap gap-1 mb-1.5">
                  {n.chain_tags.map(tag => (
                    <span
                      key={tag}
                      className="text-xs px-2 py-0.5 rounded-full"
                      // 2026-09-07 实测：浅蓝 --accent 当 12px 字色压在 accent-soft 上只有 2.0。字改本主题深蓝，底不变
                      style={{ backgroundColor: 'var(--accent-soft)', color: 'var(--st-ok-text)' }}
                    >
                      {tag}
                    </span>
                  ))}
                  {/* 官员讲话的鹰/鸽——只是关键词计数，不是解读；节点判定不认讲话只认市场定价 */}
                  {n.tone && n.tone.lean !== '中性' && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full font-medium"
                      title={isEN ? `keyword count · hawk ${n.tone.hawk} / dove ${n.tone.dove}` : `关键词计数 · 鹰${n.tone.hawk} / 鸽${n.tone.dove}`}
                      style={{
                        backgroundColor: n.tone.lean === '鹰' ? 'var(--st-fire-bg)' : 'var(--st-ok-bg)',
                        color: n.tone.lean === '鹰' ? 'var(--st-fire-text)' : 'var(--st-ok-text)',
                      }}
                    >
                      {n.tone.lean === '鹰' ? (isEN ? 'hawkish' : '偏鹰') : (isEN ? 'dovish' : '偏鸽')}
                    </span>
                  )}
                </div>
                <div className="text-xs font-medium leading-snug" style={{ color: 'var(--text)' }}>
                  {n.title}
                </div>
                <div className="text-xs mt-1.5" style={{ color: 'var(--text-muted)' }}>
                  {n.source} · {n.time}
                </div>
              </div>
            ))}
            {news.length > 6 && (
              <button
                className="neu-btn w-full py-2 text-xs"
                style={{ color: 'var(--accent)' }}
                onClick={() => setShowAllNews(v => !v)}
              >
                {showAllNews
                  ? (isEN ? 'collapse ▲' : '收起 ▲')
                  : (isEN ? `show all ${news.length} ▼` : `看全部${news.length}条 ▼`)}
              </button>
            )}
          </div>
        </section>

        {/* Calendar */}
        <section>
          <h2 className="text-base font-bold mb-3 flex items-center gap-2" style={{ color: 'var(--text)' }}>
            未来30天大事
          </h2>
          <div className="neu p-4 space-y-3">
            {calEvents.map((e, i) => (
              <div key={i} className="neu-sm px-4 py-3 flex gap-3">
                <div
                  className="font-num font-bold text-xs text-center flex-shrink-0 w-12 pt-0.5"
                  style={{ color: 'var(--st-ok-text)' }}
                >
                  {e.date.slice(5)}
                  {/* 讲话/会议带北京时间——"几点"比"哪天"更要紧，讲完才有原话可看 */}
                  {e.time_bj && (
                    <div className="font-normal mt-0.5" style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      {e.time_bj}
                    </div>
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(e.importance)}</span>
                    <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>
                      {e.event}
                    </span>
                    {e.kind === 'speech' && (
                      <span className="text-xs px-1.5 rounded-full" style={{ fontSize: 10, backgroundColor: 'var(--bg2)', color: 'var(--text-muted)' }}>
                        {isEN ? 'speech' : '讲话'}
                      </span>
                    )}
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
