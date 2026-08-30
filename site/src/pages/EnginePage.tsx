import { useState } from 'react'
import { engineLive } from '../data/live'
import { isEN } from '../i18n'

// 引擎页：地球的内部。两套逻辑框架（常规周期 + 债务动力学）怎么咬合。
// 节点带实时读数；配色走 CSS 变量，五套主题自动适配；手机端横向滚动。
const E = engineLive
const sign = (v: number | null) => v == null ? '—' : (v >= 0 ? '+' : '') + v.toFixed(2)
const pct = (v: number | null, d = 1) => v == null ? '—' : v.toFixed(d) + '%'
const num = (v: number | null) => v == null ? '—' : Math.round(v).toLocaleString('en-US')

// 单个节点：软UI外框 + 标题 + 实时读数
function Node({ x, y, w, h, engine, title, reading, sub, dashed }: {
  x: number; y: number; w: number; h: number
  engine: 'a' | 'b' | 'bridge'; title: string; reading?: string; sub?: string; dashed?: boolean
}) {
  const fill = engine === 'a' ? 'var(--accent-soft)' : engine === 'b' ? 'var(--st-fire-bg)' : 'var(--st-warn-bg)'
  const stroke = engine === 'a' ? 'var(--accent)' : engine === 'b' ? 'var(--st-fire)' : 'var(--yellow)'
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={11} fill={fill} stroke={stroke}
        strokeWidth={1.2} strokeDasharray={dashed ? '4 3' : undefined} />
      <text x={x + w / 2} y={y + (reading ? 20 : h / 2 + 4)} textAnchor="middle"
        fontSize={13} fontWeight={700} fill="var(--text)">{title}</text>
      {reading && (
        <text x={x + w / 2} y={y + 38} textAnchor="middle" fontSize={14} fontWeight={700}
          fill={stroke} fontFamily="'Baloo 2', sans-serif">{reading}</text>
      )}
      {sub && (
        <text x={x + w / 2} y={y + h - 6} textAnchor="middle" fontSize={9.5}
          fill="var(--text-muted)">{sub}</text>
      )}
    </g>
  )
}

export default function EnginePage() {
  const [help, setHelp] = useState(false)
  const taylorHot = E.taylor != null && E.taylor > 1.0
  const t = (zh: string, en: string) => isEN ? en : zh

  return (
    <div className="space-y-5">
      {/* 头部 */}
      <div className="neu p-5">
        <div className="flex items-center gap-2">
          <span className="text-2xl float-anim">🌏</span>
          <div className="font-bold text-lg" style={{ color: 'var(--accent)' }}>
            {t('引擎', 'The Engine')}
          </div>
        </div>
        <div className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('地球的内部 —— 两套逻辑框架怎么咬合。数字是实时读数，不是示意。',
             'Inside the globe — how two frameworks mesh. Numbers are live, not illustrative.')}
        </div>
        <button
          onClick={() => setHelp(v => !v)}
          className="neu-sm px-3 py-1 text-xs mt-3"
          style={{ color: 'var(--accent)' }}
        >
          {t('怎么读这张图？', 'How to read this')} {help ? '▲' : '▼'}
        </button>
        {help && (
          <div className="neu-inset p-4 mt-3 text-xs space-y-2" style={{ color: 'var(--text)' }}>
            <div><b style={{ color: 'var(--st-ok-text)' }}>{t('蓝色=常规周期引擎', 'Blue = business-cycle engine')}</b>：
              {t('教科书的通胀·就业·增长·利率联动，用来读"现在在周期哪一段"。', ' textbook links among inflation, jobs, growth, rates.')}</div>
            <div><b style={{ color: 'var(--st-fire-text)' }}>{t('粉色=债务动力学引擎', 'Pink = debt-dynamics engine')}</b>：
              {t('拍卖·买方罢工·r>g·金融抑制，教科书不覆盖的财政主导 regime。', ' auctions, buyer strike, r>g, financial repression.')}</div>
            <div><b style={{ color: 'var(--yellow)' }}>{t('黄色桥=泰勒缺口', 'Yellow bridge = Taylor gap')}</b>：
              {t('用蓝引擎的输入算出来，但一旦>100bp持续，就变成粉引擎的确认信号（金融抑制）。两个引擎在这里咬合。',
                 ' computed from the blue engine, but once it persists >100bp it confirms the pink engine.')}</div>
          </div>
        )}
      </div>

      {/* 接线图（横向滚动） */}
      <div className="neu p-3">
        <div style={{ overflowX: 'auto' }}>
          <svg viewBox="0 0 900 600" style={{ minWidth: 780, width: '100%', display: 'block',
            fontFamily: "'Noto Sans SC', sans-serif" }}>
            <defs>
              <marker id="ea" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--accent)" /></marker>
              <marker id="eb" markerWidth="9" markerHeight="9" refX="7" refY="4.5" orient="auto">
                <path d="M0,0 L9,4.5 L0,9 Z" fill="var(--st-fire)" /></marker>
              <marker id="ebr" markerWidth="10" markerHeight="10" refX="8" refY="5" orient="auto">
                <path d="M0,0 L10,5 L0,10 Z" fill="var(--yellow)" /></marker>
            </defs>

            {/* 引擎A 背景带 */}
            <rect x="10" y="12" width="880" height="250" rx="16" fill="var(--st-ok-bg)"
              stroke="var(--accent)" strokeWidth="1" opacity="0.55" />
            <text x="30" y="40" fontSize="16" fontWeight="700" fill="var(--st-ok-text)">
              {t('常规周期引擎', 'Business-cycle engine')}</text>
            <text x="30" y="58" fontSize="11" fill="var(--st-ok-text)">
              {t('通胀 · 就业 · 增长 · 利率 的常规联动', 'inflation · jobs · growth · rates')}</text>

            {/* 引擎B 背景带 */}
            <rect x="10" y="340" width="880" height="234" rx="16" fill="var(--st-fire-bg)"
              stroke="var(--st-fire)" strokeWidth="1" opacity="0.55" />
            <text x="30" y="368" fontSize="16" fontWeight="700" fill="var(--st-fire-text)">
              {t('债务动力学引擎（我们的核心域）', 'Debt-dynamics engine (our core)')}</text>
            <text x="30" y="386" fontSize="11" fill="var(--st-fire-text)">
              {t('拍卖 · 买方罢工 · r>g · 金融抑制', 'auctions · buyer strike · r>g · repression')}</text>

            {/* ===== 引擎A 节点 ===== */}
            <Node engine="a" x="30" y="112" w="118" h="52" title={t('就业/失业', 'Jobs')} sub={t('中枢变量', 'hub')} />
            <Node engine="a" x="236" y="70" w="120" h="52" title={t('衰退信号', 'Recession')} reading={sign(E.sahm)} sub={t('萨姆≥0.5触发', 'Sahm ≥0.5')} />
            <Node engine="a" x="236" y="176" w="120" h="52" title={t('通胀+产出缺口', 'Inflation+gap')} sub={t('→喂给泰勒', 'feeds Taylor')} />
            <Node engine="a" x="440" y="120" w="132" h="56" title={t('泰勒应然利率', 'Taylor-implied')} reading={sign(E.taylor) + 'pp'} sub={t('该定多少 vs 实际', 'should-be vs actual')} />
            <Node engine="a" x="650" y="70" w="126" h="52" title={t('长端利率30Y', '30Y yield')} reading={pct(E.us30y, 2)} sub={t('政策压制目标', 'repression target')} />
            <Node engine="a" x="650" y="176" w="126" h="52" title={t('实际利率(费雪)', 'Real yield')} reading={pct(E.tips10y, 2)} sub={t('黄金定价锚', 'gold anchor')} />

            {/* 引擎A 边 */}
            <line x1="148" y1="130" x2="234" y2="96" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ea)" />
            <text x="172" y="104" fontSize="10" fill="var(--st-ok-text)" transform="rotate(-22 172 104)">{t('萨姆', 'Sahm')}</text>
            <line x1="148" y1="146" x2="234" y2="196" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ea)" />
            <text x="168" y="185" fontSize="10" fill="var(--st-ok-text)" transform="rotate(22 168 185)">{t('菲利普斯', 'Phillips')}</text>
            <line x1="356" y1="200" x2="438" y2="156" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ea)" />
            <text x="378" y="192" fontSize="10" fill="var(--st-ok-text)">{t('泰勒', 'Taylor')}</text>
            <line x1="572" y1="140" x2="648" y2="100" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ea)" />
            <line x1="572" y1="156" x2="648" y2="198" stroke="var(--accent)" strokeWidth="1.6" markerEnd="url(#ea)" />

            {/* 菲利普斯失效脚注 */}
            <text x="30" y="246" fontSize="10" fill="var(--st-fire-text)">
              ⚠ {t('菲利普斯曲线在预期锚松动时失效（密歇根5年预期连续>4%）— 带脚注，不当铁律',
                   'Phillips fails when expectations unanchor — footnoted, not a law')}</text>

            {/* ===== 引擎B 节点 ===== */}
            <Node engine="b" x="30" y="434" w="126" h="50" title={t('拍卖需求', 'Auction demand')} reading={E.longBtc ? E.longBtc.toFixed(2) + '×' : '—'} sub={t('认购倍数', 'bid-to-cover')} />
            <Node engine="b" x="206" y="434" w="118" h="50" title={t('买方罢工', 'Buyer strike')} sub={t('长端失序', 'long-end stress')} />
            <Node engine="b" x="206" y="502" w="118" h="46" title="r > g" reading={pct(E.avgRate, 2)} sub={t('原地也需盈余', 'r=avg rate')} dashed />
            <Node engine="bridge" x="452" y="432" w="140" h="54" title={t('金融抑制', 'Repression')} reading={taylorHot ? t('确认', 'ON') : t('未确认', 'off')} sub={t('该加没加', 'should-hike, didn\'t')} />
            <Node engine="b" x="668" y="434" w="128" h="50" title={t('黄金结构性支撑', 'Gold support')} reading={num(E.gold)} sub={t('C路径受益', 'path-C winner')} />

            {/* 引擎B 边 */}
            <line x1="156" y1="459" x2="204" y2="459" stroke="var(--st-fire)" strokeWidth="1.6" markerEnd="url(#eb)" />
            <line x1="324" y1="459" x2="450" y2="459" stroke="var(--st-fire)" strokeWidth="1.6" markerEnd="url(#eb)" />
            <line x1="324" y1="524" x2="450" y2="474" stroke="var(--st-fire)" strokeWidth="1.6" markerEnd="url(#eb)" />
            <line x1="592" y1="459" x2="666" y2="459" stroke="var(--st-fire)" strokeWidth="1.6" markerEnd="url(#eb)" />

            {/* ===== 桥：泰勒缺口连接两个引擎 ===== */}
            <line x1="506" y1="176" x2="518" y2="430" stroke="var(--yellow)" strokeWidth="2.4"
              strokeDasharray="7 4" markerEnd="url(#ebr)" />
            <rect x="330" y="292" width="340" height="46" rx="11" fill="var(--st-warn-bg)" stroke="var(--yellow)" strokeWidth="1.2" />
            <text x="500" y="311" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text)">
              {t('桥：泰勒缺口 = 应然利率 − 实际利率', 'Bridge: Taylor gap = implied − actual')}</text>
            <text x="500" y="328" textAnchor="middle" fontSize="10.5" fill="var(--text-muted)">
              {t(`>100bp持续 → 金融抑制确认（当前 ${sign(E.taylor)}pp，r*=0.75口径）`,
                 `>100bp persists → repression confirmed (now ${sign(E.taylor)}pp, r*=0.75)`)}</text>
          </svg>
        </div>
        <div className="text-xs text-right mt-1" style={{ color: 'var(--text-muted)' }}>
          {t('实时读数 · as of', 'live · as of')} {E.generatedAt}
        </div>
      </div>
    </div>
  )
}
