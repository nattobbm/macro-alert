/* CYPERMOW MACRO TERMINAL — 唯一数据源 data/latest.json（契约见规格书§7） */
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

const SNAPSHOT_KEYS = ["spx", "vix", "gold", "silver", "dxy", "usdjpy", "brent",
  "us10y", "us30y", "tips10y", "move", "avg_rate"];

const C = { cyan: "#00e5ff", green: "#2fe6a0", red: "#ff4d6a", amber: "#ffb02e",
  gold: "#ffd166", blue: "#4da3ff", dim: "#5f7692", grid: "#16233c" };

const DARK = {
  textStyle: { color: C.dim, fontFamily: "Share Tech Mono" },
  grid: { left: 46, right: 46, top: 26, bottom: 26 },
  xAxis: { type: "category", axisLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.dim } },
  tooltip: { trigger: "axis", backgroundColor: "rgba(10,16,30,.92)", borderColor: C.grid, textStyle: { color: "#d8e6f5" } },
};
const yAxis = (opts = {}) => ({
  type: "value", scale: true,
  splitLine: { lineStyle: { color: C.grid } },
  axisLabel: { color: C.dim }, ...opts,
});
const chgClass = (v) => (v == null ? "" : v >= 0 ? "up" : "down");

/* ---------- 数字滚动动画 ---------- */
function animateValue(el, target, decimals) {
  if (target == null) { el.textContent = "—"; return; }
  el.textContent = fmt(target, decimals);          // 兜底：后台标签页rAF不执行
  if (document.hidden) return;
  const dur = 900, t0 = performance.now();
  const from = target * 0.92;
  const step = (t) => {
    const p = Math.min((t - t0) / dur, 1);
    const ease = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(from + (target - from) * ease, decimals);
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/* ---------- 3D 地球：TIC 资金流 ---------- */
const HOLDER_GEO = {
  tic_japan: { name: "JAPAN", lonlat: [139.7, 35.7] },
  tic_uk: { name: "UK", lonlat: [-0.13, 51.5] },
  tic_china: { name: "CHINA", lonlat: [116.4, 39.9] },
};
const US_GEO = [-77.03, 38.9];

async function makeEarthTexture() {
  const cv = document.createElement("canvas");
  cv.width = 2048; cv.height = 1024;
  const g = cv.getContext("2d");
  g.fillStyle = "#050b1a"; g.fillRect(0, 0, cv.width, cv.height);
  try {
    const world = await (await fetch("https://cdn.jsdelivr.net/npm/echarts@4.9.0/map/json/world.json")).json();
    const X = (lon) => (lon + 180) / 360 * cv.width;
    const Y = (lat) => (90 - lat) / 180 * cv.height;
    g.fillStyle = "#0c2440";
    g.strokeStyle = "rgba(0,229,255,0.28)";
    g.lineWidth = 1.1;
    for (const f of world.features) {
      const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) for (const ring of poly) {
        g.beginPath();
        ring.forEach(([lon, lat], i) => i ? g.lineTo(X(lon), Y(lat)) : g.moveTo(X(lon), Y(lat)));
        g.closePath(); g.fill(); g.stroke();
      }
    }
  } catch (e) { /* 离线时保持纯色球体 */ }
  return cv;
}

async function renderGlobe(tic) {
  const el = $("#globe");
  if (!window.echarts || !el) return;
  let texture;
  try { texture = await makeEarthTexture(); } catch (e) { texture = null; }

  const flows = [], points = [{
    name: "US", value: [...US_GEO, 30],
    itemStyle: { color: C.cyan }, label: { show: true, formatter: "US TREASURY", color: C.cyan },
  }];
  for (const t of tic || []) {
    const key = t.country === "Japan" ? "tic_japan" : t.country === "United Kingdom" ? "tic_uk" : "tic_china";
    const gp = HOLDER_GEO[key];
    if (!gp) continue;
    const neg = (t.chg_bn ?? 0) < 0;
    flows.push({
      coords: [gp.lonlat, US_GEO],
      lineStyle: { color: neg ? C.red : C.green, width: 2, opacity: .55 },
    });
    points.push({
      name: gp.name,
      value: [...gp.lonlat, Math.min(Math.abs(t.chg_bn ?? 5), 30)],
      itemStyle: { color: neg ? C.red : C.green },
      label: {
        show: true, color: "#d8e6f5", fontSize: 11, fontFamily: "Share Tech Mono",
        formatter: `${gp.name} ${t.chg_bn > 0 ? "+" : ""}${fmt(t.chg_bn, 1)}bn`,
      },
    });
  }

  const chart = echarts.init(el);
  chart.setOption({
    backgroundColor: "transparent",
    globe: {
      baseTexture: texture || undefined,
      shading: "color",
      environment: "transparent",
      viewControl: { autoRotate: true, autoRotateSpeed: 6, distance: 210, alpha: 25, beta: -40, targetCoord: [40, 30] },
      globeRadius: 78,
      light: { ambient: { intensity: 1 }, main: { intensity: 0 } },
    },
    series: [
      {
        type: "lines3D", coordinateSystem: "globe",
        blendMode: "lighter",
        effect: { show: true, trailWidth: 3, trailLength: 0.22, trailOpacity: 1, period: 3.2 },
        lineStyle: { width: 1.4, opacity: .35 },
        data: flows,
      },
      {
        type: "scatter3D", coordinateSystem: "globe",
        blendMode: "lighter",
        symbolSize: (v) => 6 + (v[2] ?? 5) / 4,
        itemStyle: { opacity: .95 },
        label: { show: true, position: "top", textStyle: { fontSize: 11 } },
        data: points,
      },
    ],
  });
  addEventListener("resize", () => chart.resize());
}

/* ---------- 分区渲染 ---------- */
function renderHeroTic(tic, asof) {
  $("#hero-asof").textContent = `as_of ${asof ?? "—"}`;
  $("#hero-tic").innerHTML = (tic || []).map(t => {
    const neg = (t.chg_bn ?? 0) < 0;
    return `<div class="flow-row"><span class="c">${t.country}</span>
      <span class="v">${fmt(t.holdings_bn, 1)}bn</span>
      <span class="${neg ? "neg" : "pos"}">${t.chg_bn > 0 ? "+" : ""}${fmt(t.chg_bn, 1)}</span></div>`;
  }).join("");
}

function renderHealth(h) {
  const ok = h.stale === 0;
  $("#health-summary").innerHTML =
    `<span class="badge ${ok ? "b-ok" : "b-stale"}">${h.ok}/${h.total_sources} OK</span>` +
    (ok ? "全部数据源新鲜" : `${h.stale} 个源陈旧（已排除出规则判定）`);
  $("#stale-list").innerHTML = h.stale_list.map(s =>
    `<div class="dim">⚠ <span class="mono">${s.key}</span> as_of=${s.as_of ?? "—"} · ${s.reason}</div>`).join("");
}

function sparkline(series, w = 64, h = 26, color = C.cyan) {
  if (!series || series.length < 3) return "";
  const vals = series.slice(-40).map(p => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = max - min || 1;
  const pts = vals.map((v, i) =>
    `${(i / (vals.length - 1) * w).toFixed(1)},${(h - 3 - (v - min) / span * (h - 6)).toFixed(1)}`).join(" ");
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <polyline points="${pts}" fill="none" stroke="${color}" stroke-width="1.3" opacity=".85"/></svg>`;
}

function renderSnapshot(metrics, series) {
  const by = Object.fromEntries(metrics.map(m => [m.key, m]));
  $("#snapshot").innerHTML = SNAPSHOT_KEYS.filter(k => by[k]).map(k => {
    const m = by[k];
    const chg = m.chg_1d_pct != null ? `${m.chg_1d_pct > 0 ? "+" : ""}${fmt(m.chg_1d_pct)}%`
      : m.chg_1d != null ? `${m.chg_1d > 0 ? "+" : ""}${fmt(m.chg_1d, 3)}` : "";
    const up = (m.chg_1d_pct ?? m.chg_1d ?? 0) >= 0;
    return `<div class="tile ${m.stale ? "stale" : ""}" title="${m.source}">
      <div class="label">${m.label}</div>
      <div class="value" data-key="${k}">—</div>
      <div class="chg ${chgClass(m.chg_1d_pct ?? m.chg_1d)}">${chg}</div>
      <div class="asof">${m.as_of ?? ""} · ${m.source.split(":")[0]}</div>
      ${sparkline(series[k], 64, 26, up ? C.green : C.red)}
    </div>`;
  }).join("");
  // 数字滚动
  for (const k of SNAPSHOT_KEYS) {
    const m = by[k];
    const el = document.querySelector(`.value[data-key="${k}"]`);
    if (el && m) animateValue(el, m.value, m.value > 1000 ? 0 : m.value > 100 ? 1 : 2);
  }
}

function renderRules(rules) {
  const order = { fired: 0, fired_muted: 1, skipped: 2, manual: 3, not_fired: 4 };
  const sorted = [...rules].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const fired = rules.filter(r => r.status === "fired" || r.status === "fired_muted").length;
  $("#rules-count").textContent = `FIRED ${fired} / ${rules.length}`;
  $("#rules").innerHTML = sorted.map(r => {
    const label = { fired: "▲ FIRED", fired_muted: "▲ FIRED·muted", not_fired: "● ok",
      skipped: "○ skipped", manual: "◆ manual" }[r.status] ?? r.status;
    const inputs = Object.entries(r.inputs || {}).map(([k, v]) => `${k}=${v}`).join(" ");
    return `<div class="rule ${r.status}">
      <div class="head" onclick="this.parentElement.classList.toggle('open')">
        <span><b>${r.name}</b> <span class="dim mono">${r.id}</span></span>
        <span class="status-tag st-${r.status}">${label} · ${r.severity}</span>
      </div>
      <div class="detail">
        ${inputs ? `<div class="inputs">${inputs}</div>` : ""}
        ${r.reason ? `<div>原因：${r.reason}</div>` : ""}
        <div>链条：${r.chain}</div>
        ${r.falsify ? `<div>证伪：${r.falsify}</div>` : ""}
        ${r.baseline ? `<div>基准：${r.baseline}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

function renderAuctions(auctions) {
  $("#auctions tbody").innerHTML = (auctions || []).slice(0, 6).map(a => {
    const tail = a.tail_bp != null ? `${a.tail_bp}bp`
      : a.tail_bp_synthetic != null ? `${a.tail_bp_synthetic}bp<span class="dim">(合成)</span>` : "—";
    return `<tr><td>${a.term}</td><td>${a.auction_date}</td><td>${fmt(a.offering_bn, 1)}B</td>
      <td>${fmt(a.bid_to_cover, 2)}</td><td>${fmt(a.indirect_pct, 1)}%</td>
      <td>${fmt(a.dealer_pct, 1)}%</td><td>${tail}</td></tr>`;
  }).join("");
}

function lineChart(el, opt) {
  const chart = echarts.init($(el));
  chart.setOption(opt);
  addEventListener("resize", () => chart.resize());
}

function ticChart(series) {
  const keys = [["tic_japan", "Japan"], ["tic_uk", "UK"], ["tic_china", "China"]];
  if (!series.tic_japan) return;
  lineChart("#tic-chart", {
    ...DARK,
    color: [C.red, C.blue, C.gold],
    legend: { textStyle: { color: C.dim }, top: 0 },
    xAxis: { ...DARK.xAxis, data: series.tic_japan.map(p => p[0].slice(0, 7)) },
    yAxis: yAxis({ name: "bn" }),
    series: keys.filter(([k]) => series[k]).map(([k, name]) => ({
      name, type: "line", smooth: true, symbol: "circle", symbolSize: 4,
      data: series[k].map(p => p[1]),
    })),
  });
}

function dualAxis(el, s1, s2, n1, n2) {
  if (!s1?.length) return;
  const dates = s1.map(p => p[0]);
  const m2 = new Map((s2 || []).map(p => [p[0], p[1]]));
  lineChart(el, {
    ...DARK,
    color: [C.cyan, C.gold],
    legend: { textStyle: { color: C.dim }, top: 0 },
    xAxis: { ...DARK.xAxis, data: dates },
    yAxis: [yAxis({ name: n1 }), yAxis({ name: n2, splitLine: { show: false } })],
    series: [
      { name: n1, type: "line", showSymbol: false, data: s1.map(p => p[1]) },
      { name: n2, type: "line", showSymbol: false, yAxisIndex: 1,
        data: dates.map(d => m2.get(d) ?? null), connectNulls: true },
    ],
  });
}

function singleLine(el, s, name, marks = [], color = C.cyan) {
  if (!s?.length) return;
  lineChart(el, {
    ...DARK,
    xAxis: { ...DARK.xAxis, data: s.map(p => p[0]) },
    yAxis: yAxis(),
    series: [{
      name, type: "line", showSymbol: false, data: s.map(p => p[1]),
      lineStyle: { color }, itemStyle: { color },
      areaStyle: { color: { type: "linear", x: 0, y: 0, x2: 0, y2: 1,
        colorStops: [{ offset: 0, color: color + "33" }, { offset: 1, color: "transparent" }] } },
      markLine: marks.length ? {
        silent: true, symbol: "none",
        lineStyle: { color: C.amber, type: "dashed" },
        label: { color: C.amber, fontFamily: "Share Tech Mono" },
        data: marks.map(v => ({ yAxis: v })),
      } : undefined,
    }],
  });
}

function ratioLine(el, s1, s2, name) {
  if (!s1?.length || !s2?.length) return;
  const m2 = new Map(s2.map(p => [p[0], p[1]]));
  const data = s1.filter(p => m2.has(p[0])).map(p => [p[0], +(p[1] / m2.get(p[0])).toFixed(4)]);
  singleLine(el, data, name, [], C.blue);
}

function renderCalendar(cal) {
  $("#calendar").innerHTML = (cal || []).map(c =>
    `<div class="cal-item"><span class="cal-date">${c.date}</span>${c.event}
     <div class="cal-watch">${c.watch ?? ""}</div></div>`).join("") || "<div class='dim'>无</div>";
}

function renderPredictions(p) {
  if (!p) return;
  const rows = (p.open_list || []).map(o =>
    `<div class="cal-item">
      <span class="badge ${o.locked ? "b-ok" : "b-stale"}">${o.locked ? "LOCKED" : "UNLOCKED"}</span>
      <span class="mono">${o.id}</span> <span class="dim">结算 ${o.settle_date ?? "—"} · p=${o.probability ?? "未填"}</span>
      <div class="cal-watch">${o.question ?? ""}</div>
    </div>`).join("");
  $("#predictions").innerHTML =
    `<div>开放 ${p.open} · 已结算 ${p.settled} · Brier <span class="mono">${p.brier ?? "—"}</span> (n=${p.n_for_brier})
      <span class="dim">${p.note ?? ""}</span></div>${rows}`;
}

async function main() {
  let data;
  try {
    data = await (await fetch("./data/latest.json", { cache: "no-store" })).json();
  } catch (e) {
    $("#health-summary").innerHTML = `<span class="badge b-stale">latest.json 加载失败：${e}</span>`;
    return;
  }
  $("#gen-time").textContent = `UPDATED ${data.generated_at} UTC`;
  renderHeroTic(data.tic, data.tic?.[0]?.as_of);
  renderGlobe(data.tic);
  renderHealth(data.health);
  renderSnapshot(data.metrics, data.series || {});
  renderRules(data.rules);
  renderAuctions(data.auctions);
  renderCalendar(data.calendar);
  renderPredictions(data.predictions);
  const s = data.series || {};
  dualAxis("#chart-tips-gold", s.tips10y, s.gold, "TIPS10Y %", "Gold $");
  singleLine("#chart-30y", s.us30y, "30Y %", [5.33, 5.5], C.red);
  ratioLine("#chart-spx-gold", s.spx, s.gold, "SPX/Gold");
  singleLine("#chart-curve", s.curve_10y2y, "10Y-2Y %", [0]);
  singleLine("#chart-cot", s.cot_gold, "COT净多(张)", [], C.gold);
  ticChart(s);
}
main();
