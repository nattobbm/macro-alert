import { useEffect, useRef } from 'react'
import { isEN, t } from '../i18n'

/** 经济日历页：TradingView 官方免费 events widget（合法嵌入，零成本）。
 *  深色主题(mocha/nord)自动用 dark 皮肤；语言跟随 中/EN 开关。 */
export default function CalendarPage() {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.innerHTML = ''
    const theme = document.documentElement.getAttribute('data-theme') || 'default'
    const dark = theme === 'mocha' || theme === 'nord'
    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-events.js'
    script.async = true
    script.type = 'text/javascript'
    script.innerHTML = JSON.stringify({
      colorTheme: dark ? 'dark' : 'light',
      isTransparent: true,
      width: '100%',
      height: 640,
      locale: isEN ? 'en' : 'zh_CN',
      importanceFilter: '0,1',            // 中+高重要度
      countryFilter: 'us,cn,jp,eu,gb',    // 美中日欧英
    })
    el.appendChild(script)
    return () => { el.innerHTML = '' }
  }, [])

  return (
    <div className="space-y-3">
      <div className="neu p-4">
        <div className="font-bold" style={{ color: 'var(--accent)' }}>
          📅 {t('cal_page')}
        </div>
        <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
          {t('cal_page_hint')}
        </div>
      </div>
      {/* widget 容器：外链内容，标 notranslate 防止整页机翻二次处理 */}
      <div className="neu p-2 notranslate">
        <div className="tradingview-widget-container" ref={ref} />
      </div>
    </div>
  )
}
