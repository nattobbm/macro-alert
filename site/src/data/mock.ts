// ── Deterministic data helpers ─────────────────────────────
function sin(x: number) { return Math.sin(x); }
function cos(x: number) { return Math.cos(x); }

// Deterministic pseudo-noise (no Math.random)
function noise(i: number, freq = 1, amp = 1): number {
  return sin(i * freq * 2.7183) * cos(i * freq * 1.4142) * amp;
}

// ── Sparkline data ─────────────────────────────────────────
export function genSpark(base: number, vol: number, trend = 0): number[] {
  const pts: number[] = [];
  let v = base;
  for (let i = 0; i < 40; i++) {
    v += noise(i, 0.4) * vol + trend;
    pts.push(parseFloat(v.toFixed(2)));
  }
  return pts;
}

// ── SPX OHLC (130 bars, deterministic) ────────────────────
export interface OHLC {
  date: string; open: number; high: number; low: number; close: number;
}

export function genSPX(): OHLC[] {
  const data: OHLC[] = [];
  let price = 5150;
  const start = new Date('2024-08-01');
  let day = 0;
  for (let i = 0; data.length < 130; i++) {
    const d = new Date(start.getTime() + i * 86400000);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const t = day / 130;
    const trend = t * 220;
    const w1 = sin(day * 0.12) * 60;
    const w2 = sin(day * 0.04) * 100;
    const n = noise(day, 0.7) * 30;
    const open = price;
    const target = 5150 + trend + w1 + w2 + n;
    const chg = (target - open) * 0.25 + noise(day, 1.1) * 20;
    const close = open + chg;
    const range = Math.abs(chg) + Math.abs(noise(day, 2.1)) * 25 + 8;
    data.push({
      date: d.toISOString().slice(0, 10),
      open: Math.round(open * 10) / 10,
      high: Math.round((Math.max(open, close) + range * 0.4) * 10) / 10,
      low:  Math.round((Math.min(open, close) - range * 0.4) * 10) / 10,
      close: Math.round(close * 10) / 10,
    });
    price = close;
    day++;
  }
  return data;
}

// ── Market Snapshots ───────────────────────────────────────
export interface Snapshot {
  key: string; label: string; value: string; change: number;
  unit: string; as_of: string; source: string; spark: number[];
}

export const snapshots: Snapshot[] = [
  { key: 'spx',   label: 'SPX',      value: '5,427',  change: +0.43, unit: 'pts', as_of: '2025-01-17', source: 'Bloomberg',  spark: genSpark(5200, 40, 0.6) },
  { key: 'vix',   label: 'VIX',      value: '14.8',   change: -1.23, unit: '',    as_of: '2025-01-17', source: 'CBOE',       spark: genSpark(18, 2, -0.09) },
  { key: 'gold',  label: '黄金',      value: '2,698',  change: +0.71, unit: '$/oz',as_of: '2025-01-17', source: 'Comex',      spark: genSpark(2600, 25, 0.4) },
  { key: 'dxy',   label: '美元指数',  value: '108.4',  change: -0.18, unit: '',    as_of: '2025-01-17', source: 'ICE',        spark: genSpark(106, 1.2, 0.06) },
  { key: 'jpy',   label: '美元/日元', value: '155.3',  change: +0.22, unit: '',    as_of: '2025-01-17', source: 'Reuters',    spark: genSpark(148, 2, 0.18) },
  { key: 'oil',   label: 'WTI原油',  value: '78.4',   change: +1.1,  unit: '$/bbl',as_of: '2025-01-17', source: 'NYMEX',     spark: genSpark(75, 3, 0.08) },
  { key: 'ust10', label: '10Y美债',  value: '4.64%',  change: +0.04, unit: '',    as_of: '2025-01-17', source: 'FRED',       spark: genSpark(4.3, 0.12, 0.008) },
  { key: 'ust30', label: '30Y美债',  value: '4.88%',  change: +0.03, unit: '',    as_of: '2025-01-17', source: 'FRED',       spark: genSpark(4.5, 0.1, 0.01) },
  { key: 'tips',  label: '真实利率', value: '2.07%',  change: +0.02, unit: '',    as_of: '2025-01-17', source: 'FRED',       spark: genSpark(1.8, 0.1, 0.007) },
  { key: 'move',  label: 'MOVE指数', value: '94.2',   change: +3.1,  unit: '',    as_of: '2025-01-17', source: 'ICE',        spark: genSpark(85, 5, 0.23) },
  { key: 'silver','label': '白银',   value: '31.2',   change: +0.88, unit: '$/oz',as_of: '2025-01-17', source: 'Comex',      spark: genSpark(28, 1.5, 0.08) },
  { key: 'hy',    label: '高收益差', value: '284bp',  change: -4,    unit: '',    as_of: '2025-01-17', source: 'ICE BofA',   spark: genSpark(310, 12, -0.6) },
];

// ── Alert Thresholds (18 items) ────────────────────────────
export interface Alert {
  id: string; name: string; current: string; threshold: string;
  distance_pct: number; status: 'breached' | 'warning' | 'ok'; rule_source: string;
  origin?: string; key?: string;
}

export const alerts: Alert[] = [
  { id: 'a1',  name: '真实利率 > 2.5%',    current: '2.07%', threshold: '2.50%', distance_pct: -17.2, status: 'ok',       rule_source: '金融抑制规则#3' },
  { id: 'a2',  name: '日元跌破160',        current: '155.3', threshold: '160.0', distance_pct: -2.9,  status: 'warning',  rule_source: 'BOJ干预门槛' },
  { id: 'a3',  name: 'VIX > 20（恐慌区）', current: '14.8',  threshold: '20.0',  distance_pct: -26.0, status: 'ok',       rule_source: '波动预警规则#1' },
  { id: 'a4',  name: '30Y > 5.0%',        current: '4.88%', threshold: '5.00%', distance_pct: -2.4,  status: 'warning',  rule_source: '债务危机触发器' },
  { id: 'a5',  name: 'MOVE > 120',        current: '94.2',  threshold: '120',   distance_pct: -21.5, status: 'ok',       rule_source: '债券波动规则#2' },
  { id: 'a6',  name: '黄金 > $2800',      current: '$2698', threshold: '$2800', distance_pct: -3.6,  status: 'warning',  rule_source: '黄金突破规则#1' },
  { id: 'a7',  name: 'SPX Gamma翻负',     current: '+$2.1B',threshold: '$0',    distance_pct: 100,   status: 'ok',       rule_source: 'GEX规则#4' },
  { id: 'a8',  name: '10Y破5%',           current: '4.64%', threshold: '5.00%', distance_pct: -7.2,  status: 'ok',       rule_source: '利率警报#2' },
  { id: 'a9',  name: '高收益差 > 400bp',  current: '284bp', threshold: '400bp', distance_pct: -29.0, status: 'ok',       rule_source: '信用风险规则#3' },
  { id: 'a10', name: 'DXY > 110',        current: '108.4', threshold: '110.0', distance_pct: -1.5,  status: 'warning',  rule_source: '美元强势规则#1' },
  { id: 'a11', name: '油价 > $90',        current: '$78.4', threshold: '$90',   distance_pct: -12.9, status: 'ok',       rule_source: '通胀压力规则#2' },
  { id: 'a12', name: 'SPX < 5000',       current: '5427',  threshold: '5000',  distance_pct: 100,   status: 'ok',       rule_source: '熊市触发器#1' },
  { id: 'a13', name: '金银比 > 90',       current: '86.5',  threshold: '90',    distance_pct: -3.9,  status: 'warning',  rule_source: '贵金属规则#5' },
  { id: 'a14', name: '联储缩表速度 > $95B/月', current: '$60B', threshold: '$95B', distance_pct: -36.8, status: 'ok',  rule_source: 'QT规则#1' },
  { id: 'a15', name: '国债尾差 > 3bp',   current: '1.8bp', threshold: '3bp',   distance_pct: -40.0, status: 'ok',       rule_source: '拍卖健康规则#2' },
  { id: 'a16', name: '日本持美债减少 > $100B', current: '-$62B', threshold: '-$100B', distance_pct: -38.0, status: 'ok', rule_source: '外国持仓规则#3' },
  { id: 'a17', name: '白银跌破$28',      current: '$31.2', threshold: '$28',   distance_pct: 100,   status: 'ok',       rule_source: '贵金属支撑规则#1' },
  { id: 'a18', name: '曲线倒挂消失（10Y-2Y > 0）', current: '-0.08%', threshold: '0%', distance_pct: 5.0, status: 'breached', rule_source: '收益率曲线规则#1' },
];

// ── Logic Chains ───────────────────────────────────────────
export interface ChainNode {
  label: string; value: string; threshold?: string;
  status: 'fire' | 'warning' | 'ok' | 'fact'; term: string;
}
export interface Chain {
  id: string; title: string; heat: number;
  nodes: ChainNode[]; invalidation: string;
}

export const chains: Chain[] = [
  {
    id: 'c1', title: '金融抑制链 — 央行压低利率', heat: 95,
    invalidation: '真实利率持续超过2.5%超过3个月',
    nodes: [
      { label: '财政赤字扩大', value: '$1.8T', status: 'fact', term: 'Fiscal Deficit', threshold: '' },
      { label: '债务利息占比', value: '13.1%', threshold: '12%', status: 'fire', term: 'Interest/Revenue Ratio' },
      { label: '联储缩表速度', value: '$60B/月', threshold: '$80B', status: 'ok', term: 'QT Pace' },
      { label: '真实利率', value: '2.07%', threshold: '2.5%', status: 'warning', term: 'Real Yield (TIPS-based)' },
      { label: '金融抑制判定', value: '1/3条件', status: 'warning', term: 'Financial Repression Index' },
    ],
  },
  {
    id: 'c2', title: '日元崩溃链 — 套息交易平仓', heat: 78,
    invalidation: 'BOJ加息超过0.75%且美联储降息50bp',
    nodes: [
      { label: 'BOJ政策利率', value: '0.25%', threshold: '0.5%', status: 'ok', term: 'BOJ Policy Rate' },
      { label: '美日利差', value: '5.25%', threshold: '5.5%', status: 'ok', term: 'US-JP Rate Spread' },
      { label: '日元汇率', value: '155.3', threshold: '160', status: 'warning', term: 'USD/JPY' },
      { label: '套息仓位规模', value: '$4.2T', status: 'fact', term: 'Carry Trade Notional' },
      { label: '平仓压力', value: '中等', status: 'warning', term: 'Unwind Pressure' },
    ],
  },
  {
    id: 'c3', title: '黄金突破链 — 去美元化加速', heat: 62,
    invalidation: '各国央行购金量连续3个月下降',
    nodes: [
      { label: '央行购金', value: '1037吨/年', status: 'fact', term: 'Central Bank Gold Demand' },
      { label: '真实利率', value: '2.07%', threshold: '2.5%', status: 'warning', term: 'Real Yield' },
      { label: '黄金价格', value: '$2698', threshold: '$2800', status: 'warning', term: 'Gold Spot XAU/USD' },
      { label: '黄金/SPX比', value: '0.497', threshold: '0.55', status: 'ok', term: 'Gold-Equity Ratio' },
    ],
  },
  {
    id: 'c4', title: '国债拍卖压力链', heat: 55,
    invalidation: '海外买家占比回升至70%以上连续4场',
    nodes: [
      { label: '供给量', value: '$1.3T/季', status: 'fact', term: 'Treasury Issuance' },
      { label: '海外买家占比', value: '62.1%', threshold: '65%', status: 'warning', term: 'Indirect Bid %' },
      { label: '尾差', value: '1.8bp', threshold: '3bp', status: 'ok', term: 'Auction Tail (BPs)' },
      { label: '认购倍数', value: '2.41×', threshold: '2.2×', status: 'ok', term: 'Bid-to-Cover Ratio' },
    ],
  },
  {
    id: 'c5', title: '通胀反弹链 — 油价传导', heat: 41,
    invalidation: 'CPI连续2个月低于2.5%',
    nodes: [
      { label: '油价', value: '$78.4', threshold: '$85', status: 'ok', term: 'WTI Crude Oil' },
      { label: 'CPI核心', value: '3.2%', threshold: '3.5%', status: 'ok', term: 'Core CPI YoY' },
      { label: '联储降息预期', value: '1次/年', status: 'warning', term: 'Fed Funds Implied Cuts' },
      { label: '长端通胀预期', value: '2.28%', threshold: '2.5%', status: 'ok', term: '5Y5Y Breakeven' },
    ],
  },
  {
    id: 'c6', title: 'SPX Gamma挤压链', heat: 33,
    invalidation: 'GEX翻负且VIX突破25',
    nodes: [
      { label: 'Call墙位置', value: '5500', status: 'fact', term: 'Call Wall Strike' },
      { label: 'Put墙位置', value: '5200', status: 'fact', term: 'Put Wall Strike' },
      { label: 'Gamma翻转点', value: '5350', status: 'fact', term: 'Gamma Flip Level' },
      { label: '净GEX', value: '+$2.1B', threshold: '$0', status: 'ok', term: 'Net Gamma Exposure' },
      { label: '做市商状态', value: '正Gamma', status: 'ok', term: 'Dealer Gamma Sign' },
    ],
  },
];

// ── Verdicts ───────────────────────────────────────────────
export interface Verdict {
  id: string; status: 'true' | 'false' | 'pending' | 'testing' | 'fact';
  claim: string; evidence: string; source: string;
}

export const verdicts: Verdict[] = [
  { id: 'v1', status: 'true',    claim: '黄金与真实利率负相关在2024年失效', evidence: '相关系数从-0.82降至-0.31，持续7个月', source: 'WGC 2024Q3报告' },
  { id: 'v2', status: 'fact',    claim: '美联储缩表规模2024年Q4降至$60B/月', evidence: '2024-12 FOMC会议纪要明确',               source: 'Fed.gov' },
  { id: 'v3', status: 'pending', claim: '日元160关口触发BOJ直接干预', evidence: '2024年4月155时干预；160尚未测试',         source: 'BOJ月报' },
  { id: 'v4', status: 'testing', claim: '30Y突破5%会触发股债双杀', evidence: '2023年10月4.99%时SPX-5.2%，样本n=1',       source: '自制回测' },
  { id: 'v5', status: 'false',   claim: '金银比 > 80 预测衰退准确率 > 80%', evidence: '1990-2024: 实际准确率64%，基率偏高', source: 'Macrotrends+自测' },
  { id: 'v6', status: 'true',    claim: '国债拍卖尾差扩大领先长端利率上升约2周', evidence: '2024年7次拍卖统计，平均13天',         source: '财政部拍卖数据' },
  { id: 'v7', status: 'testing', claim: 'MOVE > 120持续10天对冲基金开始去杠杆', evidence: '2023年3月：MOVE峰值194，去杠杆延迟5天',  source: 'Goldman Hedge Fund Monitor' },
  { id: 'v8', status: 'pending', claim: '中国减持美债 $100B 以上会推升10Y利率 > 20bp', evidence: '2022年减持$174B，10Y同期+40bp（混杂因素多）', source: 'TIC数据+Fed论文' },
];

// ── Predictions ────────────────────────────────────────────
export interface Prediction {
  id: string; question: string; locked: boolean; settle_date: string;
  status: 'open' | 'settled'; result?: string;
}

export const predictions: Prediction[] = [
  { id: 'p1', question: '联储2025年3月维持不变（不降息）', locked: true,  settle_date: '2025-03-20', status: 'open' },
  { id: 'p2', question: 'SPX 2025年H1收盘 > 5500',       locked: false, settle_date: '2025-06-30', status: 'open' },
  { id: 'p3', question: '黄金2025年内触及 $3000',         locked: false, settle_date: '2025-12-31', status: 'open' },
  { id: 'p4', question: '日元2025年内触及160',            locked: false, settle_date: '2025-12-31', status: 'open' },
  { id: 'p5', question: '联储2024年9月降息25bp',          locked: true,  settle_date: '2024-09-19', status: 'settled', result: '✅ 正确' },
  { id: 'p6', question: '2024年30Y突破5%并收盘在5%以上',  locked: true,  settle_date: '2024-12-31', status: 'settled', result: '❌ 错误' },
];

export const rateProbabilities = [
  { source: '期货市场（CME FedWatch）', prob: 83, color: '#5b9eb8' },
  { source: '联储点阵图隐含', prob: 75, color: '#6bb89a' },
  { source: 'Polymarket押注', prob: 79, color: '#d4a848' },
];

// ── News Feed ──────────────────────────────────────────────
export interface NewsItem {
  id: string; title: string; source: string; chain_tags: string[]; time: string;
}

export const news: NewsItem[] = [
  { id: 'n1', title: 'FOMC会议纪要：委员倾向于缓慢降息，警惕通胀反弹', source: '美联储', chain_tags: ['金融抑制', '通胀反弹'], time: '2小时前' },
  { id: 'n2', title: 'EIA原油库存下降320万桶，超预期', source: '能源信息署', chain_tags: ['通胀反弹'], time: '4小时前' },
  { id: 'n3', title: '日本央行行长植田：若经济数据符合预期，不排除1月加息', source: 'BOJ', chain_tags: ['日元崩溃'], time: '6小时前' },
  { id: 'n4', title: '财政部宣布下周30年期国债拍卖规模 $220亿', source: '美国财政部', chain_tags: ['国债拍卖'], time: '昨天' },
  { id: 'n5', title: 'IMF警告：美元走强对新兴市场债务压力上升', source: 'IMF', chain_tags: ['金融抑制', '日元崩溃'], time: '昨天' },
  { id: 'n6', title: 'Comex黄金未平仓合约创历史新高，看涨情绪浓厚', source: 'CME', chain_tags: ['黄金突破'], time: '2天前' },
];

// ── Calendar ───────────────────────────────────────────────
export interface CalEvent {
  date: string; event: string; importance: 1 | 2 | 3; watch_for: string;
}

export const calEvents: CalEvent[] = [
  { date: '2025-01-21', event: 'CPI数据发布', importance: 3, watch_for: '核心CPI是否低于3.0%' },
  { date: '2025-01-23', event: '日本央行利率决议', importance: 3, watch_for: '是否加息及日元反应' },
  { date: '2025-01-27', event: '10年期国债拍卖', importance: 2, watch_for: '尾差和海外买家比例' },
  { date: '2025-01-29', event: 'FOMC利率决议（不降息预期83%）', importance: 3, watch_for: '声明措辞是否转鹰' },
  { date: '2025-02-05', event: '非农就业数据', importance: 2, watch_for: '就业市场是否降温' },
  { date: '2025-02-12', event: 'PPI数据', importance: 1, watch_for: '上游价格传导压力' },
];

// ── Auction Table ──────────────────────────────────────────
export interface AuctionRow {
  term: string; date: string; size: string; bid_cover: number;
  indirect: number; tail: number; result: 'good' | 'ok' | 'weak';
}

export const auctions: AuctionRow[] = [
  { term: '30年',  date: '2025-01-09', size: '$220亿', bid_cover: 2.41, indirect: 62.1, tail:  1.8, result: 'ok'   },
  { term: '10年',  date: '2025-01-08', size: '$390亿', bid_cover: 2.53, indirect: 68.4, tail:  0.9, result: 'good' },
  { term: '3年',   date: '2025-01-07', size: '$580亿', bid_cover: 2.71, indirect: 71.2, tail: -0.2, result: 'good' },
  { term: '30年',  date: '2024-12-12', size: '$220亿', bid_cover: 2.38, indirect: 61.3, tail:  2.1, result: 'ok'   },
  { term: '10年',  date: '2024-12-11', size: '$390亿', bid_cover: 2.44, indirect: 64.8, tail:  1.4, result: 'ok'   },
  { term: '10年',  date: '2024-11-13', size: '$390亿', bid_cover: 2.31, indirect: 59.2, tail:  3.6, result: 'weak' },
];

// ── Alert Rules (30 items) ─────────────────────────────────
export interface AlertRule {
  id: string; name: string; status: 'fire' | 'muted' | 'ok' | 'skip' | 'manual';
  triggered: string; cause: string; invalidation: string;
}

export const alertRules: AlertRule[] = [
  { id: 'r1',  name: '债务利息/收入 > 12%',      status: 'fire',   triggered: '13.1%',  cause: '财政赤字扩大 + 高利率环境', invalidation: '税收增长或利率下行' },
  { id: 'r2',  name: '收益率曲线再陡化（10Y-2Y > 0）', status: 'fire', triggered: '-0.08%→+0.02%', cause: '长端抛售 or 短端降息', invalidation: '曲线重新倒挂' },
  { id: 'r3',  name: 'DXY > 107 持续30天',       status: 'fire',   triggered: '已持续47天', cause: '美联储相对其他央行更鹰', invalidation: 'DXY连续5天收于106以下' },
  { id: 'r4',  name: '日元 > 150',               status: 'fire',   triggered: '155.3',  cause: '利差吸引套息', invalidation: 'BOJ加息或Fed大幅降息' },
  { id: 'r5',  name: '黄金/SPX比突破0.5',        status: 'ok',     triggered: '尚未',   cause: '避险需求 > 风险偏好', invalidation: '比值回落至0.45以下' },
  { id: 'r6',  name: 'MOVE > 100',               status: 'ok',     triggered: '94.2',   cause: '债市不确定性', invalidation: 'MOVE持续低于85' },
  { id: 'r7',  name: '金银比 > 88',              status: 'ok',     triggered: '86.5',   cause: '工业需求走弱', invalidation: '金银比降至80以下' },
  { id: 'r8',  name: '拍卖尾差连续3次 > 2bp',    status: 'ok',     triggered: '未连续', cause: '需求不足', invalidation: '连续3场尾差 < 1bp' },
  { id: 'r9',  name: 'VIX > 20',                 status: 'ok',     triggered: '14.8',   cause: '期权买家恐慌', invalidation: 'VIX持续低于16' },
  { id: 'r10', name: '油价 > $85',               status: 'ok',     triggered: '$78.4',  cause: 'OPEC+供给收紧或地缘', invalidation: '油价回落并稳定在$75以下' },
  { id: 'r11', name: '高收益差 > 400bp',         status: 'ok',     triggered: '284bp',  cause: '信用恐慌', invalidation: '差值持续低于300bp' },
  { id: 'r12', name: '联储缩表加速 > $95B/月',   status: 'muted',  triggered: 'N/A',    cause: '过度收紧流动性', invalidation: '2025年前暂不适用' },
  ...Array.from({ length: 18 }, (_, i) => ({
    id: `r${i + 13}`,
    name: ['长端通胀预期 > 2.5%', '5Y TIPS > 2.3%', '美联储ON RRP < $200B', '银行储备金 < $3T', 'SPX跌破200日均线', '纳指/SPX比跌破1.3', '铜金比 < 0.15', '信用脉冲转负', 'M2同比 < 0%', '中国持美债降至$700B以下', '日本干预外汇市场', 'SPX单周跌幅 > 5%', 'VIX期限结构反转', '10Y拍卖失败（bid-cover < 2.2）', '新兴市场美元债CDS走阔 > 300bp', '全球央行同步紧缩信号', '美联储紧急会议召开', '美债被降级（穆迪）'][i],
    status: (['ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'skip', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok'][i]) as AlertRule['status'],
    triggered: '尚未',
    cause: '监控中',
    invalidation: '条件反转',
  })),
];

// ── GEX Data ───────────────────────────────────────────────
export interface GexBar {
  strike: number; call_gex: number; put_gex: number;
}

export const gexData: GexBar[] = (() => {
  const current = 5427;
  const strikes = Array.from({ length: 17 }, (_, i) => current - 400 + i * 50);
  return strikes.map(strike => {
    const dist = (strike - current) / current;
    const call = Math.max(0, (noise(strike, 0.01) * 0.5 + 0.5) * 2.5 * Math.exp(-dist * dist * 400));
    const putDist = (strike - (current - 150)) / 80;
    const put  = Math.max(0, (noise(strike + 100, 0.01) * 0.5 + 0.5) * 2.0 * Math.exp(-(putDist * putDist)));
    return { strike, call_gex: parseFloat(call.toFixed(2)), put_gex: -parseFloat(put.toFixed(2)) };
  });
})();

// ── Data Health ────────────────────────────────────────────
export interface DataSource {
  name: string; status: 'ok' | 'stale'; last_updated: string; reason?: string;
}

export const dataSources: DataSource[] = [
  { name: 'FRED - 真实利率 (DFII10)',     status: 'ok',    last_updated: '2025-01-17' },
  { name: 'FRED - 联邦基金利率',          status: 'ok',    last_updated: '2025-01-17' },
  { name: 'CBOE - VIX指数',              status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Bloomberg - SPX日K',          status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Comex - 黄金现货',            status: 'ok',    last_updated: '2025-01-17' },
  { name: 'ICE - 美元指数 DXY',          status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Reuters - 美元/日元',         status: 'ok',    last_updated: '2025-01-17' },
  { name: 'NYMEX - WTI原油',            status: 'ok',    last_updated: '2025-01-17' },
  { name: 'FRED - 10Y国债利率',          status: 'ok',    last_updated: '2025-01-17' },
  { name: 'FRED - 30Y国债利率',          status: 'ok',    last_updated: '2025-01-17' },
  { name: 'ICE BofA - 高收益差',         status: 'ok',    last_updated: '2025-01-17' },
  { name: 'ICE - MOVE指数',             status: 'ok',    last_updated: '2025-01-17' },
  { name: '财政部TIC - 日本持仓',        status: 'stale', last_updated: '2024-11-30', reason: 'TIC数据延迟2个月' },
  { name: '财政部TIC - 中国持仓',        status: 'stale', last_updated: '2024-11-30', reason: 'TIC数据延迟2个月' },
  { name: '财政部TIC - 英国持仓',        status: 'stale', last_updated: '2024-11-30', reason: 'TIC数据延迟2个月' },
  { name: 'CME FedWatch - 降息概率',     status: 'ok',    last_updated: '2025-01-17' },
  { name: 'CME - GEX期权数据',          status: 'ok',    last_updated: '2025-01-17' },
  { name: '财政部 - 国债拍卖结果',        status: 'ok',    last_updated: '2025-01-09' },
  { name: 'WGC - 央行购金量',            status: 'stale', last_updated: '2024-12-31', reason: 'WGC季报，下次更新2025Q1' },
  { name: 'CFTC - 大户持仓报告',         status: 'ok',    last_updated: '2025-01-14' },
  { name: 'BOJ - 货币政策声明',          status: 'ok',    last_updated: '2024-12-19' },
  { name: 'Fed - FOMC会议纪要',          status: 'ok',    last_updated: '2025-01-08' },
  { name: 'BLS - CPI数据',              status: 'ok',    last_updated: '2024-12-11' },
  { name: 'EIA - 原油库存',             status: 'ok',    last_updated: '2025-01-15' },
  { name: 'FRED - M2货币供应',           status: 'ok',    last_updated: '2024-12-31' },
  { name: 'FRED - 银行储备金',           status: 'ok',    last_updated: '2025-01-15' },
  { name: 'IMF - 全球债务数据库',        status: 'stale', last_updated: '2024-10-01', reason: 'IMF年度数据，下次更新2025-10' },
  { name: 'Comex - 白银现货',           status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Polymarket - 联储预测概率',   status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Reuters - TIPS隐含通胀',      status: 'ok',    last_updated: '2025-01-17' },
  { name: 'Bloomberg - 信用脉冲',        status: 'stale', last_updated: '2025-01-10', reason: 'Bloomberg Terminal访问限制' },
  { name: '自制 - GEX历史序列',          status: 'ok',    last_updated: '2025-01-17' },
  { name: '自制 - 逻辑链热度得分',       status: 'ok',    last_updated: '2025-01-17' },
  { name: 'OFR - 系统风险指数',          status: 'stale', last_updated: '2024-12-31', reason: 'OFR月度更新，等待1月数据' },
  { name: 'WSJ - 经济学家调查',          status: 'ok',    last_updated: '2025-01-15' },
  { name: 'Fed - Z.1资金流向',           status: 'stale', last_updated: '2024-09-30', reason: 'Z.1季度发布，下次2025-03' },
  { name: 'CME - 铜期货',              status: 'ok',    last_updated: '2025-01-17' },
  { name: 'LBMA - 黄金大户持仓',        status: 'ok',    last_updated: '2025-01-17' },
  { name: 'ECB - 欧洲央行利率',         status: 'ok',    last_updated: '2025-01-16' },
  { name: 'BIS - 美元流动性指标',        status: 'stale', last_updated: '2024-09-30', reason: 'BIS季度数据延迟发布' },
  { name: '财政部 - 财政赤字月度数据',   status: 'ok',    last_updated: '2025-01-10' },
  { name: '自制 - 知识库文件追踪',       status: 'ok',    last_updated: '2025-01-17' },
  { name: 'S&P - 信用评级数据库',        status: 'ok',    last_updated: '2025-01-17' },
];

// ── Trend chart data ───────────────────────────────────────
export const trendRealRate = Array.from({ length: 60 }, (_, i) => ({
  date: new Date(new Date('2024-07-01').getTime() + i * 7 * 86400000).toISOString().slice(0, 10),
  real_rate: parseFloat((1.6 + i * 0.008 + sin(i * 0.3) * 0.15).toFixed(3)),
  gold:       Math.round(2550 + i * 2.5 + sin(i * 0.2) * 40),
}));

export const trend30Y = Array.from({ length: 60 }, (_, i) => ({
  date: new Date(new Date('2024-07-01').getTime() + i * 7 * 86400000).toISOString().slice(0, 10),
  rate: parseFloat((4.3 + i * 0.01 + sin(i * 0.25) * 0.12).toFixed(3)),
}));

export const trendSPXGold = Array.from({ length: 60 }, (_, i) => ({
  date: new Date(new Date('2024-07-01').getTime() + i * 7 * 86400000).toISOString().slice(0, 10),
  ratio: parseFloat((0.45 + i * 0.001 + sin(i * 0.3) * 0.015).toFixed(4)),
}));
