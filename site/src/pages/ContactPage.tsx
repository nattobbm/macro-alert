import { t as tr } from '../i18n'

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

export default function ContactPage() {
  const isEN = (() => { try { return localStorage.getItem('lang') === 'en' } catch { return false } })()
  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="neu p-6 text-center">
        <div className="text-5xl mb-3">🌏</div>
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
