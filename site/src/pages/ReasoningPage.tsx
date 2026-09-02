import { useState } from 'react'
import { chains, verdicts, predictions, rateProbabilities, news, calEvents } from '../data/live'
import { t as tr, isEN } from '../i18n'

const STATUS_META = {
  fire:    { dot: 'var(--st-fire)', label: tr('breached'), color: 'var(--st-fire-text)' },
  warning: { dot: 'var(--st-warn)', label: tr('warning_w'),  color: 'var(--st-warn-text)' },
  ok:      { dot: 'var(--st-ok)',   label: tr('ok_w'),  color: 'var(--st-ok-text)' },
  fact:    { dot: 'var(--accent)',  label: tr('v_fact'),  color: 'var(--accent)' },
}

const VERDICT_META = {
  true:    { dot: 'var(--st-ok)',   label: tr('v_true'), color: 'var(--st-ok-text)' },
  false:   { dot: 'var(--st-fire)', label: tr('v_false'), color: 'var(--st-fire-text)' },
  pending: { dot: 'var(--st-mute)', label: tr('v_pending'), color: 'var(--st-mute-text)' },
  testing: { dot: 'var(--accent)',  label: tr('v_testing'), color: 'var(--accent)' },
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
                                  {node.premiseBroken ? (isEN ? 'premise broken' : '前提已翻') : meta.label}
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
                        style={{ color: 'var(--accent)' }}>{p.ranking}</span>
                    )}
                    {p.probability != null && (
                      <span className="ml-2 font-num font-medium notranslate"
                        style={{ color: 'var(--accent)' }}>{(p.probability * 100).toFixed(0)}%</span>
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
                  style={{ color: 'var(--accent)' }}
                >
                  {e.date.slice(5)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-1.5">
                    <span style={{ color: 'var(--yellow)' }}>{'★'.repeat(e.importance)}</span>
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
