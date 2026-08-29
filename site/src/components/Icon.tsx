// Mingcute Icons (https://github.com/Richard9394/MingCute) - Apache License 2.0
// Copyright (c) MingCute Design. 由 @iconify-json/mingcute 提取，勿手改。

const ICONS: Record<string, string> = {
  home: `<path fill="none" stroke="currentColor" stroke-width="2" d="M4 9.5a1 1 0 0 1 .4-.8l7-5.25a1 1 0 0 1 1.2 0l7 5.25a1 1 0 0 1 .4.8V19a1 1 0 0 1-1 1h-4.9a.1.1 0 0 1-.1-.1V14a2 2 0 1 0-4 0v5.9a.1.1 0 0 1-.1.1H5a1 1 0 0 1-1-1z"/>`,
  brain: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 7v10m0-10a3 3 0 1 0-6 0v2a3 3 0 1 0 0 6m6-8a3 3 0 1 1 6 0v2a3 3 0 1 1 0 6m-6 2a3 3 0 1 1-6 0v-2m6 2a3 3 0 1 0 6 0v-2M6 15c.35 0 .687-.06 1-.17M9 12a3 3 0 0 1 3 3a3 3 0 0 1 3-3m3 3c-.35 0-.687-.06-1-.17"/>`,
  chart: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5v14h16M6.783 14.182l4.242-4.243l3.536 3.536L20.036 8H17"/>`,
  archive: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16m-8 3v5m-2.121-1.521L12 16.6l2.121-2.121m5.586-7.772l-2.414-2.414A1 1 0 0 0 16.586 4H7.414a1 1 0 0 0-.707.293L4.293 6.707A1 1 0 0 0 4 7.414V19a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7.414a1 1 0 0 0-.293-.707"/>`,
  mailbox: `<path fill="currentColor" d="M17 16a1 1 0 1 0-2 0zm-2 4a1 1 0 1 0 2 0zM6 8a1 1 0 0 0 0 2zm1 2a1 1 0 0 0 0-2zm-.5-6v1h11V3h-11zM21 7.5h-1V15h2V7.5zM20 16v-1H4v2h16zM3 15h1V7.5H2V15zm7-7.5H9V16h2V7.5zm6 8.5h-1v4h2v-4zM6 9v1h1V8H6zm-2 7v-1H2a2 2 0 0 0 2 2zm17-1h-1v2a2 2 0 0 0 2-2zM17.5 4v1A2.5 2.5 0 0 1 20 7.5h2A4.5 4.5 0 0 0 17.5 3zm-11 0v1A2.5 2.5 0 0 1 9 7.5h2A4.5 4.5 0 0 0 6.5 3zm0 0V3A4.5 4.5 0 0 0 2 7.5h2A2.5 2.5 0 0 1 6.5 5z"/>`,
  calendar: `<path fill="currentColor" d="M17 4a1 1 0 1 0-2 0zm-2 2a1 1 0 1 0 2 0zM9 4a1 1 0 0 0-2 0zM7 6a1 1 0 0 0 2 0zM5 6v1h14V5H5zm15 1h-1v12h2V7zm-1 13v-1H5v2h14zM4 19h1V7H3v12zm0-8v1h16v-2H4zm12-7h-1v2h2V4zM8 4H7v2h2V4zM5 20v-1H3a2 2 0 0 0 2 2zm15-1h-1v2a2 2 0 0 0 2-2zM19 6v1h2a2 2 0 0 0-2-2zM5 6V5a2 2 0 0 0-2 2h2z"/>`,
  planet: `<path fill="none" stroke="currentColor" stroke-width="2" d="M21.526 6.5c.461.798-.064 2.054-1.74 3.656a8 8 0 0 1-13.274 7.665c-2.227.65-3.577.478-4.038-.32m0 0c.828 1.434 4.53.847 11.026-2.903s8.855-6.663 8.026-8.098c-.415-.72-1.744-.82-3.69-.325a.53.53 0 0 1-.484-.121a8 8 0 0 0-13.179 7.61a.53.53 0 0 1-.137.48C2.634 15.58 2.058 16.78 2.474 17.5Z"/>`,
  balloon: `<path fill="currentColor" d="M11 20v-1a1 1 0 0 0-1 1zm2 0h1a1 1 0 0 0-1-1zm0 1v1a1 1 0 0 0 1-1zm-2 0h-1a1 1 0 0 0 1 1zm0-1v1h2v-2h-2zm2 0h-1v1h2v-1zm0 1v-1h-2v2h2zm-2 0h1v-1h-2v1zm8-11h-1c0 2.144-1.069 3.894-2.426 5.138a8.7 8.7 0 0 1-2.069 1.413C12.823 16.878 12.29 17 12 17v2c.71 0 1.552-.253 2.37-.645a10.7 10.7 0 0 0 2.556-1.743C18.569 15.106 20 12.856 20 10zm-7 8v-1c-.29 0-.823-.122-1.505-.449a8.7 8.7 0 0 1-2.07-1.413C7.07 13.894 6 12.144 6 10H4c0 2.856 1.431 5.106 3.074 6.612a10.7 10.7 0 0 0 2.556 1.743c.818.392 1.66.645 2.37.645zm-7-8h1a6 6 0 0 1 6-6V2a8 8 0 0 0-8 8zm7-7v1a6 6 0 0 1 6 6h2a8 8 0 0 0-8-8zm0 0l-.769-.64v.001l-.002.002l-.003.003l-.009.012a4 4 0 0 0-.123.158a10 10 0 0 0-.317.448a13 13 0 0 0-.93 1.649C9.177 6.042 8.5 8.064 8.5 10.5h2c0-2.064.574-3.792 1.153-5.008c.289-.606.576-1.08.788-1.398a8 8 0 0 1 .314-.438l.013-.016l.002-.002l-.001.001zm-2.5 7.5h-1c0 2.436.676 4.458 1.347 5.867c.336.706.674 1.264.93 1.649a10 10 0 0 0 .412.57q.016.023.028.036l.01.012l.002.003l.002.002L12 18l.769-.64v.002h.001l-.002-.002l-.013-.016l-.064-.083a8 8 0 0 1-.25-.355c-.212-.318-.5-.792-.788-1.398A11.7 11.7 0 0 1 10.5 10.5zM12 3l-.769.64v-.001l-.001-.001l.002.002l.013.016l.064.083c.057.077.144.196.25.355c.212.318.5.792.788 1.398A11.7 11.7 0 0 1 13.5 10.5h2c0-2.436-.676-4.458-1.347-5.867a13 13 0 0 0-.93-1.649a10 10 0 0 0-.44-.606l-.01-.012l-.002-.003l-.002-.002zm2.5 7.5h-1c0 2.064-.574 3.792-1.153 5.008c-.289.606-.576 1.08-.788 1.398a8 8 0 0 1-.314.438l-.013.016l-.002.002l.001-.001L12 18l.77.639v-.002l.004-.003l.009-.012l.028-.035q.036-.044.095-.123q.122-.159.317-.448c.256-.385.594-.943.93-1.649c.67-1.409 1.347-3.431 1.347-5.867z"/>`,
  compass: `<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 12h.002M21 12a9 9 0 1 1-18 0a9 9 0 0 1 18 0M7.757 16.243c-.353-.354.708-4.95 2.122-6.364s6.01-2.475 6.364-2.121c.353.353-.707 4.95-2.122 6.363c-1.414 1.415-6.01 2.475-6.364 2.122"/>`,
}

export function Icon({ name, size = 20, className = '', style }: {
  name: string; size?: number; className?: string; style?: React.CSSProperties
}) {
  const body = ICONS[name]
  if (!body) return null
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className}
      style={style} aria-hidden="true" dangerouslySetInnerHTML={{ __html: body }} />
  )
}
