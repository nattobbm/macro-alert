import { createRoot } from 'react-dom/client'
import './index.css'

async function boot() {
  try {
    const r = await fetch('./data/latest.json', { cache: 'no-store' })
    if (r.ok) (globalThis as any).__LATEST = await r.json()
  } catch { /* 拿不到就用mock兜底 */ }
  const { default: App } = await import('./App')
  createRoot(document.getElementById('root')!).render(<App />)
}
boot()
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {})
