// SPX K线（lightweight-charts v5）：可滑动缩放 + 期权墙价位线 + 墙位每日轨迹
// 墙轨迹历史从2026-08-27自建存档起步（CBOE免费链无历史），逐日生长
import { useEffect, useRef } from 'react'
import {
  createChart, CandlestickSeries, LineSeries, LineStyle,
  type IChartApi, type Time,
} from 'lightweight-charts'
import { genSPX, gexMeta, gexHistory } from '../data/live'

function cssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

export default function Kline({ height = 340 }: { height?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const themed = () => ({
      layout: {
        background: { color: 'transparent' },
        textColor: cssVar('--text-muted'),
        fontFamily: "'Baloo 2', 'Noto Sans SC', sans-serif",
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: cssVar('--border'), style: LineStyle.Dotted },
        horzLines: { color: cssVar('--border'), style: LineStyle.Dotted },
      },
      timeScale: { borderColor: cssVar('--border'), rightOffset: 4 },
      rightPriceScale: { borderColor: cssVar('--border') },
      crosshair: { mode: 0 },
      // 滚轮留给页面滚动；图内拖动平移、双指/轴拖动缩放（手机上竖划不被图表截获）
      handleScroll: { mouseWheel: false, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: false, pinch: true, axisPressedMouseMove: true },
    })

    const chart = createChart(el, { ...themed(), height, autoSize: false, width: el.clientWidth })
    chartRef.current = chart

    const green = cssVar('--green'), red = cssVar('--red'), yellow = cssVar('--yellow')
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: green, downColor: red, borderUpColor: green, borderDownColor: red,
      wickUpColor: green, wickDownColor: red,
    })
    const data = genSPX().map(d => ({
      time: d.date as Time, open: d.open, high: d.high, low: d.low, close: d.close,
    }))
    candles.setData(data)

    // 当前墙位：价格轴上的水平线
    const g = gexMeta
    if (g && !g.stale) {
      const mk = (price: number | null, color: string, title: string) => {
        if (price == null) return
        candles.createPriceLine({
          price, color, lineWidth: 1, lineStyle: LineStyle.Dashed,
          axisLabelVisible: true, title,
        })
      }
      mk(g.call_wall, green, 'Call墙')
      mk(g.flip, yellow, 'γ翻转')
      mk(g.put_wall, red, 'Put墙')
    }

    // 墙位每日轨迹（阶梯虚线，随存档逐日生长）
    const mkTrail = (key: 'call_wall' | 'put_wall' | 'flip', color: string) => {
      const pts = gexHistory
        .filter(h => h[key] != null)
        .map(h => ({ time: h.date as Time, value: h[key] as number }))
      if (pts.length < 2) return
      const s = chart.addSeries(LineSeries, {
        color, lineWidth: 1, lineStyle: LineStyle.Dotted, lineType: 1,
        priceLineVisible: false, lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      s.setData(pts)
    }
    mkTrail('call_wall', green)
    mkTrail('flip', yellow)
    mkTrail('put_wall', red)

    // 初始视野：近60根，可往回滑2年
    chart.timeScale().setVisibleLogicalRange({ from: data.length - 60, to: data.length + 4 })

    const ro = new ResizeObserver(() => {
      chart.applyOptions({ width: el.clientWidth })
    })
    ro.observe(el)

    // 主题切换 → 重刷图表配色
    const mo = new MutationObserver(() => {
      chart.applyOptions(themed())
      const gr = cssVar('--green'), rd = cssVar('--red')
      candles.applyOptions({
        upColor: gr, downColor: rd, borderUpColor: gr, borderDownColor: rd,
        wickUpColor: gr, wickDownColor: rd,
      })
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    return () => { ro.disconnect(); mo.disconnect(); chart.remove(); chartRef.current = null }
  }, [height])

  return <div ref={ref} style={{ width: '100%' }} />
}
