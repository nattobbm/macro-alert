import { useState, useEffect } from 'react'
import { lang, setLang, t } from './i18n'
import { Icon } from './components/Icon'
import OverviewPage from './pages/OverviewPage'
import ReasoningPage from './pages/ReasoningPage'
import EquityPage from './pages/EquityPage'
import DataPage from './pages/DataPage'
import ContactPage from './pages/ContactPage'
import CalendarPage from './pages/CalendarPage'
import EnginePage from './pages/EnginePage'

type Theme = 'default' | 'balloon' | 'latte' | 'mocha' | 'nord'
type Tab = 'overview' | 'reasoning' | 'equity' | 'data' | 'contact' | 'calendar' | 'engine'

// 联系/日历不占主导航——主屏只展示数据，入口收进右上角小按钮
const TABS: { id: Tab; icon: string; label: string }[] = [
  { id: 'overview',  icon: 'home',    label: t('tab_overview') },
  { id: 'reasoning', icon: 'brain',   label: t('tab_reasoning') },
  { id: 'equity',    icon: 'chart',   label: t('tab_equity') },
  { id: 'data',      icon: 'archive', label: t('tab_data') },
]

// 主题切换圆点：外圈=底色 内点=主色（缩小版，手机上不占地）
const THEMES: { id: Theme; label: string; bg: string; fg: string }[] = [
  { id: 'default', label: '浅灰蓝', bg: '#d8e8f4', fg: '#5b9eb8' },
  { id: 'balloon', label: '气球村', bg: '#FAF0DC', fg: '#FF8FA3' },
  { id: 'latte',   label: 'Latte',  bg: '#eff1f5', fg: '#1e66f5' },
  { id: 'mocha',   label: 'Mocha',  bg: '#1e1e2e', fg: '#89b4fa' },
  { id: 'nord',    label: 'Nord',   bg: '#2e3440', fg: '#88c0d0' },
]

export default function App() {
  const [theme, setTheme] = useState<Theme>(() =>
    (localStorage.getItem('cypermow-theme') as Theme) || 'default'
  )
  const [tab, setTab] = useState<Tab>('overview')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('cypermow-theme', theme)
  }, [theme])

  return (
    <div className="min-h-full pb-28 md:pb-6" style={{ backgroundColor: 'var(--bg)' }}>

      {/* ── Header ──────────────────────────────────────── */}
      <header
        className="sticky top-0 z-40 px-4 pt-4 pb-3"
        style={{ backgroundColor: 'var(--bg)' }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl float-anim">🌏</span>
            <div>
              <div
                className="font-num font-bold text-lg leading-none"
                style={{ color: 'var(--accent)' }}
              >
                CYPERMOW
              </div>
              <div className="text-xs leading-none mt-0.5" style={{ color: 'var(--text-muted)' }}>
                {t('subtitle')}
              </div>
            </div>
          </div>

          {/* 右上角小工具：日历 / 联系 / 语言 / 主题圆点 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('calendar')}
              className="neu-sm p-2 rounded-xl notranslate"
              style={{ color: tab === 'calendar' ? 'var(--accent)' : 'var(--text-muted)' }}
              title={t('cal_page')}
            >
              <Icon name="calendar" size={17} />
            </button>
            <button
              onClick={() => setTab('contact')}
              className="neu-sm p-2 rounded-xl notranslate"
              style={{ color: tab === 'contact' ? 'var(--accent)' : 'var(--text-muted)' }}
              title={t('tab_contact')}
            >
              <Icon name="mailbox" size={17} />
            </button>
            {/* Language toggle：notranslate=按钮自身文案不参与整页机翻 */}
            <button
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="neu-sm px-3 py-1.5 text-xs font-bold rounded-xl notranslate"
              style={{ color: 'var(--accent)' }}
              title="中/EN"
            >
              {lang === 'zh' ? 'EN' : '中'}
            </button>

            {/* Theme dots */}
            <div className="neu-sm flex items-center gap-1.5 px-2 py-1.5 rounded-xl ml-1">
              {THEMES.map(th => (
                <button
                  key={th.id}
                  onClick={() => setTheme(th.id)}
                  title={th.label}
                  aria-label={th.label}
                  className="rounded-full transition-transform"
                  style={{
                    width: 18, height: 18,
                    backgroundColor: th.bg,
                    border: theme === th.id ? '2px solid var(--accent)' : '1px solid var(--border)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    transform: theme === th.id ? 'scale(1.15)' : 'none',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: '50%', backgroundColor: th.fg, display: 'block' }} />
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Desktop tab bar */}
        <nav className="max-w-5xl mx-auto mt-3 hidden md:flex gap-2">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`px-5 py-2 text-sm font-medium transition-all flex items-center gap-1.5 ${
                tab === tb.id ? 'neu-pill-active' : 'neu-pill'
              }`}
              style={{ color: tab === tb.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Icon name={tb.icon} size={17} /> {tb.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Page ─────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-2">
        {tab === 'overview'  && <OverviewPage onGlobeClick={() => setTab('engine')} />}
        {tab === 'engine'    && <EnginePage />}
        {tab === 'reasoning' && <ReasoningPage />}
        {tab === 'equity'    && <EquityPage />}
        {tab === 'data'      && <DataPage />}
        {tab === 'contact'   && <ContactPage />}
        {tab === 'calendar'  && <CalendarPage />}

        {/* 版权与授权声明：站点公开后的归属标记 */}
        <div className="text-xs text-center mt-8 mb-2 px-2 leading-relaxed"
          style={{ color: 'var(--text-muted)', opacity: 0.8 }}>
          {t('copyright')}
        </div>
      </main>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <nav className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
        <div className="neu-pill flex items-center gap-0.5 px-2 py-2">
          {TABS.map(tb => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex flex-col items-center px-4 py-1.5 transition-all rounded-2xl ${
                tab === tb.id ? 'neu-pill-active' : ''
              }`}
              style={{ color: tab === tb.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <Icon name={tb.icon} size={21} />
              <span className="text-xs mt-0.5">{tb.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
