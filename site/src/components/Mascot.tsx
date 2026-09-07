// CYPERMOW 小地球 · 榜一（冠军配色 combo3 · 三格腮红）
// 源：资产库/吉祥物-小地球/小地球_UI版_冠军_milkblue-青绿.html 的 earth() 原样移植。
// 规格（不许改）：海洋 #B8D8EA · 陆地 #6bb89a/#86c9ac · 高光 #ECF7FD · 腮红 #EDA1AC · 眼嘴 #33454F
//   删横带 · 无眼神光（日式高级）· 腮红每侧三格（col2-4 / col11-13）
// 用途：页头 logo（替掉 🌏 emoji）、favicon、任何要出现"我们自己的地球"的地方。
// 纯函数生成 SVG，无依赖；size 是像素边长，expr 是表情。

const OCEAN = '#B8D8EA', LAND = '#6bb89a', LAND_LT = '#86c9ac'
const SHINE = '#ECF7FD', CHEEK = '#EDA1AC', INK = '#33454F'

// 每行 [起始列, 结束列]：圆形遮罩
const MASK: [number, number][] = [
  [5, 10], [3, 12], [2, 13], [1, 14], [1, 14], [0, 15], [0, 15], [0, 15],
  [0, 15], [0, 15], [0, 15], [1, 14], [1, 14], [2, 13], [3, 12], [5, 10],
]
const LAND_PX: [number, number][] = [
  [3, 10], [3, 11], [4, 10], [4, 11], [4, 12], [5, 11], [5, 12], [5, 13],
  [8, 2], [8, 3], [9, 2], [9, 3], [9, 4], [10, 3], [10, 4], [11, 3],
  [11, 10], [12, 9], [12, 10], [12, 11], [13, 10], [6, 13], [7, 13],
]
const LAND_LIGHT = new Set(['3,10', '4,10', '8,2', '9,2', '11,10', '12,9'])
const SHINE_PX = new Set(['2,4', '2,5', '3,3'])
const LAND_SET = new Set(LAND_PX.map(p => p.join(',')))
const CHEEK_PX: [number, number][] = [[8, 2], [8, 3], [8, 4], [8, 11], [8, 12], [8, 13]]

export type MascotExpr = 'happy' | 'wink' | 'sleepy' | 'wow'
const FACES: Record<MascotExpr, { eye: [number, number][]; mouth: [number, number][] }> = {
  happy:  { eye: [[6, 5], [7, 5], [6, 10], [7, 10]], mouth: [[9, 7], [9, 8]] },
  wink:   { eye: [[6, 5], [7, 5], [7, 9], [7, 10], [7, 11]], mouth: [[9, 7], [9, 8], [10, 8]] },
  sleepy: { eye: [[7, 4], [7, 5], [7, 6], [7, 9], [7, 10], [7, 11]], mouth: [[9, 8]] },
  wow:    { eye: [[6, 5], [7, 5], [6, 10], [7, 10]], mouth: [[9, 7], [9, 8], [10, 7], [10, 8]] },
}

function rects(px: number, expr: MascotExpr) {
  const out: { x: number; y: number; fill: string }[] = []
  const inside = (r: number, c: number) => c >= MASK[r][0] && c <= MASK[r][1]
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    if (!inside(r, c)) continue
    const k = `${r},${c}`
    let col = OCEAN
    if (LAND_SET.has(k)) col = LAND_LIGHT.has(k) ? LAND_LT : LAND
    if (SHINE_PX.has(k)) col = SHINE
    out.push({ x: c * px, y: r * px, fill: col })
  }
  const f = FACES[expr] ?? FACES.happy
  CHEEK_PX.forEach(([r, c]) => out.push({ x: c * px, y: r * px, fill: CHEEK }))
  f.eye.forEach(([r, c]) => out.push({ x: c * px, y: r * px, fill: INK }))
  f.mouth.forEach(([r, c]) => out.push({ x: c * px, y: r * px, fill: INK }))
  return out
}

/** 原始 HTML 里 rect 有 -.7 外扩和 rx=.38px 圆角，像素之间不留缝、略带黏土感。这里原样保留。 */
export default function Mascot({ size = 32, expr = 'happy', title = 'CYPERMOW 小地球', className, style }:
  { size?: number; expr?: MascotExpr; title?: string; className?: string; style?: React.CSSProperties }) {
  const px = 10                       // 内部单位；用 viewBox 缩放到 size
  const W = 16 * px
  return (
    <svg width={size} height={size} viewBox={`0 0 ${W} ${W}`} role="img" aria-label={title}
      className={className} style={{ display: 'block', ...style }}>
      <title>{title}</title>
      {rects(px, expr).map((r, i) => (
        <rect key={i} x={r.x - 0.7} y={r.y - 0.7} width={px + 1.4} height={px + 1.4} rx={px * 0.38} fill={r.fill} />
      ))}
    </svg>
  )
}

/** favicon 用：同一张图的 SVG 字符串（写进 index.html 的 data URI 或生成 favicon.svg） */
export function mascotSvgString(expr: MascotExpr = 'happy'): string {
  const px = 10, W = 16 * px
  const body = rects(px, expr).map(r =>
    `<rect x="${r.x - 0.7}" y="${r.y - 0.7}" width="${px + 1.4}" height="${px + 1.4}" rx="${px * 0.38}" fill="${r.fill}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}">${body}</svg>`
}
