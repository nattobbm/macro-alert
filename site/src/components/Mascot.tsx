// CYPERMOW 小地球 · 官方主脸（logo）
// 唯一权威：资产库/吉祥物-小地球/2026-09-01_小地球_克制版_蓝眼.html（hash 08354ea0…）
//   Momo 2026-09-01 拍板"升为新冠军·主脸"。老冠军（眼嘴 #33454F、圆角黏土感）已降为存档母版。
// 参数原样照抄，一个都不许改（Momo 铁律：基础元素一经确定，除非她点名，一个字都不许改）：
//   海洋 #B8D8EA · 陆地 #6bb89a / 浅 #86c9ac · 云 #F2FAFF · 腮红 #EDA1AC（每侧三格 col2-4 / col11-13）
//   眼+嘴 #2E5A7A（蓝·克制）· 无眼神光 · 删横带 · 硬边像素（crispEdges，方块不重叠不圆角）
// 用途：页头 logo（替掉 🌏 emoji）、favicon、任何要出现"我们自己的地球"的地方。
// 2026-09-07 我曾错移植成老冠军（#33454F + 圆角），当天改回。

const OCEAN = '#B8D8EA', LAND = '#6bb89a', LAND_LT = '#86c9ac'
const CLOUD = '#F2FAFF', CHEEK = '#EDA1AC', EYE = '#2E5A7A'

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
const CLOUD_PX = new Set(['2,4', '2,5', '3,3'])
const LAND_SET = new Set(LAND_PX.map(p => p.join(',')))
const CHEEK_PX: [number, number][] = [[8, 2], [8, 3], [8, 4], [8, 11], [8, 12], [8, 13]]

// 表情：品牌脸冻结，只覆盖 eye/mouth（表情库 2026-09-01）。logo 恒用 happy。
export type MascotExpr = 'happy' | 'wink' | 'sleepy' | 'wow'
const FACES: Record<MascotExpr, { eye: [number, number][]; mouth: [number, number][] }> = {
  happy:  { eye: [[6, 5], [7, 5], [6, 10], [7, 10]], mouth: [[9, 7], [9, 8]] },
  wink:   { eye: [[6, 5], [7, 5], [7, 9], [7, 10], [7, 11]], mouth: [[9, 7], [9, 8], [10, 8]] },
  sleepy: { eye: [[7, 4], [7, 5], [7, 6], [7, 9], [7, 10], [7, 11]], mouth: [[9, 8]] },
  wow:    { eye: [[6, 5], [7, 5], [6, 10], [7, 10]], mouth: [[9, 7], [9, 8], [10, 7], [10, 8]] },
}

const PX = 16                          // 内部单位，与定稿文件一致；用 viewBox 缩放到 size
const W = 16 * PX

function rects(expr: MascotExpr) {
  const out: { x: number; y: number; fill: string }[] = []
  const inside = (r: number, c: number) => c >= MASK[r][0] && c <= MASK[r][1]
  for (let r = 0; r < 16; r++) for (let c = 0; c < 16; c++) {
    if (!inside(r, c)) continue
    const k = `${r},${c}`
    let col = OCEAN
    if (CLOUD_PX.has(k)) col = CLOUD
    else if (LAND_SET.has(k)) col = LAND_LIGHT.has(k) ? LAND_LT : LAND
    out.push({ x: c * PX, y: r * PX, fill: col })
  }
  const f = FACES[expr] ?? FACES.happy
  CHEEK_PX.forEach(([r, c]) => out.push({ x: c * PX, y: r * PX, fill: CHEEK }))
  f.eye.forEach(([r, c]) => out.push({ x: c * PX, y: r * PX, fill: EYE }))
  f.mouth.forEach(([r, c]) => out.push({ x: c * PX, y: r * PX, fill: EYE }))
  return out
}

export default function Mascot({ size = 32, expr = 'happy', title = 'CYPERMOW 小地球', className, style }:
  { size?: number; expr?: MascotExpr; title?: string; className?: string; style?: React.CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox={`0 0 ${W} ${W}`} role="img" aria-label={title}
      shapeRendering="crispEdges" className={className}
      style={{ display: 'block', imageRendering: 'pixelated', ...style }}>
      <title>{title}</title>
      {rects(expr).map((r, i) => (
        <rect key={i} x={r.x} y={r.y} width={PX} height={PX} fill={r.fill} />
      ))}
    </svg>
  )
}

/** favicon 用：同一张图的 SVG 字符串 */
export function mascotSvgString(expr: MascotExpr = 'happy'): string {
  const body = rects(expr).map(r =>
    `<rect x="${r.x}" y="${r.y}" width="${PX}" height="${PX}" fill="${r.fill}"/>`).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${W}" shape-rendering="crispEdges">${body}</svg>`
}
