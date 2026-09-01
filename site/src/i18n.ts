// 轻量i18n：localStorage('lang') = 'zh' | 'en'，切换后reload
export const lang: 'zh' | 'en' =
  ((): 'zh' | 'en' => { try { return (localStorage.getItem('lang') as any) || 'zh' } catch { return 'zh' } })()
export const isEN = lang === 'en'
export function setLang(l: 'zh' | 'en') { try { localStorage.setItem('lang', l) } catch {}; location.reload() }

const dict: Record<string, [string, string]> = {
  subtitle: ['宏观监控系统', 'Macro Monitor'],
  tab_overview: ['总览', 'Home'], tab_reasoning: ['推理', 'Logic'], tab_equity: ['市场', 'Market'], tab_data: ['数据', 'Data'],
  tic_title: ['持有美债 · 三国动向', 'US Treasury Holdings · Top 3'],
  tic_hint: ['点击看引擎 · 红线=三国在卖美债', 'Tap to open the engine · red arcs = selling'],
  regime_fallback: ['金融抑制监控', 'Repression Monitor'],
  regime_scenario: ['当前剧本', 'Current Regime'],
  conds_met: ['条件成立', 'conditions met'],
  active_alerts: ['越线', 'Crossed'], near_threshold: ['快到', 'Near'], status_ok: ['安静', 'Quiet'],
  radar_title: ['警戒线雷达', 'Threshold Radar'], radar_n: ['项监控', 'monitored'],
  breached: ['越线', 'Crossed'], warning_w: ['快到', 'Near'], ok_w: ['安静', 'Quiet'],
  line: ['线', 'line'], gap: ['差', 'gap'],
  snapshot_title: ['市场快照', 'Market Snapshot'],
  role_leading: ['领先', 'Leading'], role_coincident: ['同步', 'Coincident'], role_lagging: ['滞后', 'Lagging'],
  role_leading_tip: ['用于预判，通常领先6-18个月', 'For forecasting; typically leads 6-18 months'],
  role_coincident_tip: ['确认当前位置', 'Confirms where we are now'],
  role_lagging_tip: ['只能验证不能预测——勿当领先指标用', 'Confirms the past — never use to predict'],
  chains_title: ['逻辑链', 'Logic Chains'],   // 原文案"按热度排序，横向滚动"两句都已不成立：热度显示改成了越线/快到，
  // 节点在手机上也改成竖排了。文案描述的是界面行为，界面变了必须跟着改
  chains_hint: ['点开看每条链走到哪一步了', 'tap a chain to see its steps'],
  fired_n: ['处越线', 'crossed'], invalidation: ['失效条件', 'What would prove it wrong'],
  verdicts_title: ['结论库', 'Verdict Library'],
  v_true: ['已验证', 'Verified'], v_false: ['已证伪', 'Falsified'], v_pending: ['待定中', 'Pending'],
  v_testing: ['攒样本', 'Building sample'], v_fact: ['基本事实', 'Fact'],
  pred_title: ['预测记分卡', 'Prediction Scorecard'],
  locked: ['已锁定', 'Locked'], unlocked: ['未锁定', 'Open'], settle: ['结算', 'Settles'],
  odds_title: ['9月加息概率 · 三源对照', 'Sep Hike Odds · 3 Sources'],
  news_title: ['官方消息流', 'Official Feed'], cal_title: ['未来30天大事', 'Next 30 Days'],
  kline_title: ['大盘K线 + 做市商地图', 'SPX + Dealer Map'],
  gex_title: ['每个价位的磁力(GEX)', 'GEX by Strike'],
  pos_gamma: ['正Gamma（价格磁吸，波动小）', 'Positive gamma (pinning, low vol)'],
  neg_gamma: ['负Gamma（放大波动）', 'Negative gamma (amplifies moves)'],
  mm_state: ['做市商状态', 'Dealer state'],
  auction_title: ['国债拍卖', 'Treasury Auctions'], auction_src: ['美国财政部拍卖结果 · 最近', 'US Treasury results · latest'],
  rules_title: ['自动警报器', 'Alert Rules'],
  r_fire: ['已响', 'Fired'], r_muted: ['已响(静音中)', 'Muted'], r_ok: ['正常', 'OK'], r_skip: ['数据缺跳过', 'Skipped'], r_manual: ['人工盯', 'Manual'],
  health_title: ['数据体检', 'Data Health'], charts_title: ['走势图', 'Trends'],
  stale: ['过期', 'stale'], fresh: ['新鲜', 'fresh'],
  tab_contact: ['联系', 'Contact'],
  cal_page: ['经济日历', 'Economic Calendar'],
  cal_page_hint: ['自建日历 · 星级=重要度 · 点开看"这条为什么重要" · 时间已换成你的本地时区', 'Self-hosted · stars = importance · tap a row for why it matters · times in your local timezone'],
  cn_time: ['中国', 'China'], us_time: ['美东', 'US East'], your_tz: ['你的时区', 'Your timezone'],
  contact_footer: ['数据每日自动更新 · 非投资建议', 'Data auto-updates daily · Not investment advice'],
  copyright: ['© 2026 纳豆 · 代码 AGPL-3.0 · 推理链与结论库 CC BY-NC-SA 4.0（转载请署名）',
              '© 2026 nattobbm · Code AGPL-3.0 · Research content CC BY-NC-SA 4.0 (attribution required)'],
  target: ['目标', 'target'], source_w: ['来源', 'source'], evidence_w: ['证据', 'evidence'],
}
export function t(k: string): string {
  const e = dict[k]; return e ? (isEN ? e[1] : e[0]) : k
}
