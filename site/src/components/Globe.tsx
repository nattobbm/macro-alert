// Cute animated SVG globe with arc flight lines
interface TicRow { country: string; sub: string; chg: number }
export default function Globe({ tic, asOf, onClick }: { tic?: TicRow[]; asOf?: string; onClick?: () => void }) {
  const subOf = (name: string, fallback: string) => {
    const row = tic?.find(r => r.country.includes(name))
    return row ? row.sub : fallback
  }
  const CX = 150, CY = 150, R = 120;

  // Simplified continent-like blobs (rough lat/lon projected to SVG)
  const project = (lat: number, lon: number): [number, number] => {
    const x = CX + (lon / 180) * R * 0.88;
    const y = CY - (lat / 90) * R * 0.88;
    return [x, y];
  };

  const [jpX, jpY] = project(36, 138);
  const [cnX, cnY] = project(35, 105);
  const [ukX, ukY] = project(52, -2);
  const [usX, usY] = project(38, -97);

  const arcPath = (x1: number, y1: number, x2: number, y2: number) => {
    const mx = (x1 + x2) / 2;
    const my = Math.min(y1, y2) - 35;
    return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  };

  return (
    <div
      className="relative rounded-3xl overflow-hidden transition-transform hover:scale-[1.015]"
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      title={onClick ? '点击看引擎' : undefined}
      style={{
        background: 'var(--globe-bg)',
        boxShadow: 'inset 5px 5px 15px #00000050, inset -3px -3px 10px #ffffff08',
        width: 300, height: 300,
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <svg width={300} height={300} viewBox="0 0 300 300">
        {/* Space stars */}
        {[
          [20, 25], [270, 40], [15, 200], [285, 180], [40, 270],
          [260, 260], [130, 15], [260, 130], [30, 130], [160, 280],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={1} fill="white" opacity={0.4 + (i % 3) * 0.2} />
        ))}

        {/* Globe circle */}
        <circle cx={CX} cy={CY} r={R} fill="#0f2744" stroke="#1a3d6e" strokeWidth={1.5} />

        {/* Latitude grid lines */}
        {[-60, -30, 0, 30, 60].map(lat => {
          const ry = (lat / 90) * R * 0.88;
          const ellipseRx = Math.sqrt(Math.max(0, R * R - ry * ry)) * 0.88;
          return (
            <ellipse
              key={lat} cx={CX} cy={CY - ry}
              rx={ellipseRx} ry={ellipseRx * 0.15}
              fill="none" stroke="#1e4a7a" strokeWidth={0.5} opacity={0.6}
            />
          );
        })}

        {/* Longitude grid lines */}
        {[-120, -60, 0, 60, 120].map(lon => {
          const x = CX + (lon / 180) * R * 0.88;
          return (
            <line key={lon} x1={x} y1={CY - R} x2={x} y2={CY + R}
              stroke="#1e4a7a" strokeWidth={0.5} opacity={0.4} />
          );
        })}

        {/* Continent blobs (very simplified) */}
        {/* North America */}
        <path d="M 55 95 Q 65 80 90 82 Q 100 95 95 120 Q 85 140 70 135 Q 52 120 55 95 Z"
          fill="#1a5c3a" opacity={0.75} />
        {/* South America */}
        <path d="M 75 145 Q 88 140 95 155 Q 95 185 80 200 Q 68 195 68 170 Q 65 155 75 145 Z"
          fill="#1a5c3a" opacity={0.75} />
        {/* Europe / Africa */}
        <path d="M 130 85 Q 148 78 155 90 Q 158 102 145 108 Q 132 105 128 95 Z"
          fill="#1a5c3a" opacity={0.75} />
        <path d="M 132 112 Q 155 108 160 125 Q 162 155 148 175 Q 132 180 125 162 Q 118 140 125 120 Z"
          fill="#1a5c3a" opacity={0.75} />
        {/* Asia */}
        <path d="M 165 75 Q 215 70 225 85 Q 230 105 215 115 Q 195 118 178 110 Q 162 100 165 85 Z"
          fill="#1a5c3a" opacity={0.75} />
        {/* Japan (small) */}
        <path d="M 222 95 Q 228 92 232 98 Q 230 104 224 102 Z"
          fill="#1a5c3a" opacity={0.75} />
        {/* Australia */}
        <path d="M 210 178 Q 235 170 242 185 Q 240 208 220 215 Q 205 210 205 195 Z"
          fill="#1a5c3a" opacity={0.75} />

        {/* Globe highlight (rim light) */}
        <circle cx={CX - 35} cy={CY - 40} r={R}
          fill="none" stroke="white" strokeWidth={1.5} opacity={0.06} />

        {/* Arc flight lines */}
        <path d={arcPath(jpX, jpY, usX, usY)} fill="none"
          stroke="#f38ba8" strokeWidth={1.8} opacity={0.9}
          strokeDasharray="200" className="arc-anim" />
        <path d={arcPath(cnX, cnY, usX, usY)} fill="none"
          stroke="#f38ba8" strokeWidth={1.8} opacity={0.9}
          strokeDasharray="200" className="arc-anim-2" />
        <path d={arcPath(ukX, ukY, usX, usY)} fill="none"
          stroke="#f38ba8" strokeWidth={1.5} opacity={0.8}
          strokeDasharray="200" className="arc-anim-3" />

        {/* Country dots */}
        {[
          { cx: jpX, cy: jpY, label: '🇯🇵 日本', sub: subOf('Japan', '¥1.08T ↓'), dx: 8, dy: -8 },
          { cx: cnX, cy: cnY, label: '🇨🇳 中国', sub: subOf('China', '$0.77T ↓'), dx: 8, dy: 10 },
          { cx: ukX, cy: ukY, label: '🇬🇧 英国', sub: subOf('United Kingdom', '$0.69T ↓'), dx: -78, dy: -8 },
        ].map((c, i) => (
          <g key={i}>
            <circle cx={c.cx} cy={c.cy} r={7} fill="#f38ba820" className="pulse-dot" style={{ animationDelay: `${i * 0.7}s` }} />
            <circle cx={c.cx} cy={c.cy} r={3.5} fill="#f38ba8" />
            <text x={c.cx + c.dx} y={c.cy + c.dy} fill="white" fontSize={8.5} fontFamily="'Noto Sans SC', sans-serif" fontWeight={500}>{c.label}</text>
            <text x={c.cx + c.dx} y={c.cy + c.dy + 10} fill="#f38ba8" fontSize={7.5} fontFamily="'Baloo 2', sans-serif">{c.sub}</text>
          </g>
        ))}

        {/* US dot */}
        <circle cx={usX} cy={usY} r={9} fill="#88c0d020" />
        <circle cx={usX} cy={usY} r={4.5} fill="#88c0d0" />
        <text x={usX - 20} y={usY - 12} fill="#88c0d0" fontSize={8} fontFamily="'Noto Sans SC', sans-serif" fontWeight={700}>🇺🇸 美国</text>
        <text x={usX - 20} y={usY + 18} fill="#88c0d0" fontSize={7} fontFamily="'Noto Sans SC', sans-serif" opacity={0.8}>持有中心</text>
      </svg>

      {/* Corner label */}
      <div className="absolute bottom-3 right-3 text-right" style={{ fontFamily: "'Noto Sans SC'" }}>
        <div style={{ color: '#f38ba8', fontSize: 9, opacity: 0.8 }}>● 持续减持</div>
        <div style={{ color: '#7f849c', fontSize: 8, marginTop: 1 }}>as of {asOf ?? '—'} · TIC</div>
      </div>
    </div>
  );
}
