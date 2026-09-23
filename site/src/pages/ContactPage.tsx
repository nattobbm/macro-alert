import { useEffect, useState } from 'react'
import { t as tr } from '../i18n'
import Mascot from '../components/Mascot'

const LINKS = [
  {
    icon: '🐙', label: 'GitHub', value: 'nattobbm',
    href: 'https://github.com/nattobbm',
    note_zh: '本站源码与研究仓库', note_en: 'Source code & research repos',
  },
  {
    icon: '🎵', label: '抖音', value: 'nattobbm',
    href: null,
    note_zh: '搜索用户名关注', note_en: 'Search the handle to follow',
  },
  {
    icon: '📕', label: '小红书', value: 'nattobbm',
    href: null,
    note_zh: '搜索用户名关注', note_en: 'Search the handle to follow',
  },
  {
    icon: '💬', label: 'Discord', value: 'discord.gg/GsPdapQ25',
    href: 'https://discord.gg/GsPdapQ25',
    note_zh: '进群一起看宏观', note_en: 'Join the macro chat',
  },
  {
    icon: '✉️', label: 'Email', value: 'nattobbm@gmail.com',
    href: 'mailto:nattobbm@gmail.com',
    note_zh: '合作与联系', note_en: 'Business & contact',
  },
]

// 2026-09-22 Momo：「教使用者加个链接在主页，相当于 app」。
// 不做小程序（个人主体不能开金融类目、web-view 要企业资质 + 备案），做 PWA：
// Android/桌面 Chrome 能弹原生安装框（beforeinstallprompt）；iPhone 没有这个事件，只能写步骤。
function InstallCard({ isEN }: { isEN: boolean }) {
  const [deferred, setDeferred] = useState<any>(null)
  const [done, setDone] = useState(false)
  const standalone = (() => {
    try {
      return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true
    } catch { return false }
  })()
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : ''
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const isWeChat = /MicroMessenger/i.test(ua)
  useEffect(() => {
    const h = (e: Event) => { e.preventDefault(); setDeferred(e) }
    window.addEventListener('beforeinstallprompt', h)
    return () => window.removeEventListener('beforeinstallprompt', h)
  }, [])
  if (standalone) {
    return (
      <div className="neu p-4 text-sm" style={{ color: 'var(--text-muted)' }}>
        <div className="font-bold mb-1" style={{ color: 'var(--text)' }}>{isEN ? 'Installed' : '已经装在主屏幕了'}</div>
        {isEN ? 'You are running the installed version. Content updates on open — nothing else to do.' : '你现在打开的就是装好的版本，内容打开时自动更新，不用再装。'}
      </div>
    )
  }
  const steps = isWeChat
    ? (isEN
      ? ['Tap ··· top-right → "Open in browser"', 'Then follow the steps for your phone below']
      : ['点右上角 ···  → 「在浏览器打开」', '再按下面你手机的步骤做'])
    : isIOS
      ? (isEN
        ? ['Open this page in Safari', 'Tap the share button (square with arrow)', 'Scroll and tap "Add to Home Screen"', 'Tap "Add" — the globe icon appears on your home screen']
        : ['用 Safari 打开本站', '点底部中间的「分享」（方框带箭头）', '往下翻，点「添加到主屏幕」', '点右上「添加」——小地球图标就在桌面了'])
      : (isEN
        ? ['Tap ⋮ top-right in Chrome', 'Tap "Add to Home screen" / "Install app"', 'Confirm — the globe icon appears on your home screen']
        : ['Chrome 右上角 ⋮', '点「添加到主屏幕」或「安装应用」', '确认——小地球图标就在桌面了'])
  return (
    <div className="neu p-4">
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">📲</span>
        <div>
          <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{isEN ? 'Put it on your phone like an app' : '装到手机桌面，当 app 用'}</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {isEN ? 'Free, no app store, full-screen, opens in one tap. Updates itself.' : '不用商店、不花钱，全屏打开一键进，内容自己更新'}
          </div>
        </div>
      </div>
      {deferred ? (
        <button
          className="neu w-full py-2 text-sm font-bold mb-2"
          style={{ color: 'var(--accent)' }}
          onClick={async () => {
            try { deferred.prompt(); const r = await deferred.userChoice; if (r?.outcome === 'accepted') setDone(true) } catch { /* 用户取消 */ }
            setDeferred(null)
          }}
        >
          {isEN ? 'Install now' : '一键安装'}
        </button>
      ) : null}
      {done ? (
        <div className="text-xs" style={{ color: 'var(--green)' }}>{isEN ? 'Done — check your home screen.' : '装好了，看桌面。'}</div>
      ) : (
        <ol className="text-xs space-y-1 pl-4 list-decimal" style={{ color: 'var(--text-muted)' }}>
          {steps.map(s => <li key={s}>{s}</li>)}
        </ol>
      )}
    </div>
  )
}

export default function ContactPage() {
  const isEN = (() => { try { return localStorage.getItem('lang') === 'en' } catch { return false } })()
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <InstallCard isEN={isEN} />
      <div className="neu p-6 text-center">
        <div className="mb-3 flex justify-center"><Mascot size={64} expr="wink" /></div>
        <div className="font-bold text-lg mb-1" style={{ color: 'var(--text)' }}>
          纳豆 · CYPERMOW
        </div>
        <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
          {isEN
            ? 'Macro logic chains, live data, and pre-registered forecasts — reasoning you can settle.'
            : '宏观逻辑链 · 实时数据 · 可结算的预测——把"看懂"变成可测量的判断力'}
        </div>
      </div>

      <div className="space-y-3">
        {LINKS.map(l => {
          const inner = (
            <div className="neu p-4 flex items-center gap-4 transition-transform hover:-translate-y-0.5">
              <span className="text-3xl flex-shrink-0">{l.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm" style={{ color: 'var(--text)' }}>{l.label}</div>
                <div className="font-num text-sm truncate" style={{ color: 'var(--accent)' }}>{l.value}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {isEN ? l.note_en : l.note_zh}
                </div>
              </div>
              {l.href && <span style={{ color: 'var(--text-muted)' }}>→</span>}
            </div>
          )
          return l.href ? (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="block">
              {inner}
            </a>
          ) : (
            <div key={l.label}>{inner}</div>
          )
        })}
      </div>

      <div className="text-center text-xs pb-4" style={{ color: 'var(--text-muted)' }}>
        {tr('contact_footer')}
      </div>
    </div>
  )
}
