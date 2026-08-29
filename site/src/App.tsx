import { useState, useEffect } from 'react'
import { lang, setLang, t } from './i18n'
import OverviewPage from './pages/OverviewPage'
import ReasoningPage from './pages/ReasoningPage'
import EquityPage from './pages/EquityPage'
import DataPage from './pages/DataPage'
import ContactPage from './pages/ContactPage'
import CalendarPage from './pages/CalendarPage'

type Theme = 'default' | 'latte' | 'mocha' | 'nord'
type Tab = 'overview' | 'reasoning' | 'equity' | 'data' | 'contact' | 'calendar'

// 联系/日历不占主导航——主屏只展示数据，入口收进右上角小按钮
const TABS: { id: Tab; emoji: string; label: string }[] = [
  { id: 'overview',  emoji: '🏠', label: t('tab_overview') },
  { id: 'reasoning', emoji: '🧠', label: t('tab_reasoning') },
  { id: 'equity',    emoji: '📈', label: t('tab_equity') },
  { id: 'data',      emoji: '🗃️', label: t('tab_data') },
]

const THEMES: { id: Theme; label: string }[] = [
  { id: 'default', label: '浅灰蓝' },
  { id: 'latte',   label: 'Latte' },
  { id: 'mocha',   label: 'Mocha' },
  { id: 'nord',    label: 'Nord' },
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
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
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

          {/* Theme switcher */}
          <div className="neu-sm flex items-center gap-1 p-1.5">
            {THEMES.map(t => (
              <button
                key={t.id}
                onClick={() => setTheme(t.id)}
                className="px-2.5 py-1 text-xs rounded-xl transition-all"
                style={
                  theme === t.id
                    ? { backgroundColor: 'var(--accent)', color: '#fff', boxShadow: 'inset 2px 2px 4px rgba(0,0,0,0.25)' }
                    : { color: 'var(--text-muted)' }
                }
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* 右上角小工具：日历 / 联系 / 语言 */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setTab('calendar')}
              className="neu-sm px-2.5 py-1.5 text-sm rounded-xl notranslate"
              style={{ color: tab === 'calendar' ? 'var(--accent)' : 'var(--text-muted)' }}
              title={t('cal_page')}
            >
              📅
            </button>
            <button
              onClick={() => setTab('contact')}
              className="neu-sm px-2.5 py-1.5 text-sm rounded-xl notranslate"
              style={{ color: tab === 'contact' ? 'var(--accent)' : 'var(--text-muted)' }}
              title={t('tab_contact')}
            >
              📮
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
          </div>
        </div>

        {/* Desktop tab bar */}
        <nav className="max-w-5xl mx-auto mt-3 hidden md:flex gap-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-5 py-2 text-sm font-medium transition-all ${
                tab === t.id ? 'neu-pill-active' : 'neu-pill'
              }`}
              style={{ color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              {t.emoji} {t.label}
            </button>
          ))}
        </nav>
      </header>

      {/* ── Page ─────────────────────────────────────────── */}
      <main className="max-w-5xl mx-auto px-4 py-2">
        {tab === 'overview'  && <OverviewPage />}
        {tab === 'reasoning' && <ReasoningPage />}
        {tab === 'equity'    && <EquityPage />}
        {tab === 'data'      && <DataPage />}
        {tab === 'contact'   && <ContactPage />}
        {tab === 'calendar'  && <CalendarPage />}
      </main>

      {/* ── Mobile bottom nav ────────────────────────────── */}
      <nav className="md:hidden fixed bottom-5 left-1/2 -translate-x-1/2 z-50">
        <div className="neu-pill flex items-center gap-0.5 px-2 py-2">
          {TABS.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-col items-center px-4 py-1.5 transition-all rounded-2xl ${
                tab === t.id ? 'neu-pill-active' : ''
              }`}
              style={{ color: tab === t.id ? 'var(--accent)' : 'var(--text-muted)' }}
            >
              <span className="text-xl">{t.emoji}</span>
              <span className="text-xs mt-0.5">{t.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  )
}
