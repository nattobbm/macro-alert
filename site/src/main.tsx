import { createRoot } from 'react-dom/client'
import './index.css'

async function boot() {
  // 两份数据并行取：latest.json 是完整快照(每天2次)，
  // quotes.json 是盘中轻量行情(每20分钟)，谁的 as_of 新用谁的价。
  const [full, quotes] = await Promise.all([
    fetch('./data/latest.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('./data/quotes.json', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null),
  ])
  if (full) {
    if (quotes?.quotes) {
      full.quotes = quotes.quotes
      full.quotes_at = quotes.generated_at
      // 覆盖 metrics 里的行情项（只在 quotes 更新时覆盖，宏观数据不动）
      for (const m of full.metrics ?? []) {
        const q = quotes.quotes[m.key]
        if (q && q.value != null && (!m.as_of || q.as_of >= m.as_of)) {
          m.value = q.value
          m.as_of = q.as_of
          if (q.chg_1d_pct != null) m.chg_1d_pct = q.chg_1d_pct
          m.intraday = true
        }
      }
    }
    ;(globalThis as any).__LATEST = full
  }
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(<App />)
}
boot()
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
