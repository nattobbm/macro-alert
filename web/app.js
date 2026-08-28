/* CYPERMOW MACRO TERMINAL — 唯一数据源 data/latest.json（契约见规格书§7） */
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

const SNAPSHOT_KEYS = ["spx", "vix", "gold", "silver", "dxy", "usdjpy", "brent",
  "us10y", "us30y", "tips10y", "move", "avg_rate"];

function cssVar(n){ return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }
const C = { cyan: cssVar("--s1"), green: cssVar("--s3"), red: cssVar("--s8"), amber: cssVar("--s4"),
  gold: cssVar("--s4"), blue: cssVar("--s1"), dim: cssVar("--dim"), grid: cssVar("--line"),
  ink: cssVar("--ink"), card: cssVar("--card"),
  s: [1,2,3,4,5,6,7,8].map(i=>cssVar("--s"+i)),
  good: cssVar("--good"), bad: cssVar("--bad"), warn: cssVar("--warn") };
document.querySelectorAll("#themes button").forEach(b=>{
  const cur = document.documentElement.dataset.theme || "paper";
  b.classList.toggle("active", b.dataset.setTheme === cur);
  b.onclick = () => { try{localStorage.setItem("theme", b.dataset.setTheme)}catch(e){}; location.reload(); };
});

const DARK = {
  textStyle: { color: C.dim, fontFamily: "Baloo 2, Noto Sans SC" },
  backgroundColor: "transparent",
  grid: { left: 46, right: 46, top: 26, bottom: 26 },
  xAxis: { type: "category", axisLine: { lineStyle: { color: C.grid } }, axisLabel: { color: C.dim } },
  tooltip: { trigger: "axis", backgroundColor: C.card, borderColor: C.ink, textStyle: { color: C.ink } },
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
      ${sparkline(series[k], 64, 26, up ? C.good : C.bad)}
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
    const label = { fired: "🔥 响了", fired_muted: "🔕 响过(静音中)", not_fired: "🟢 正常",
      skipped: "⏸️ 数据缺跳过", manual: "✍️ 人工盯" }[r.status] ?? r.status;
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
    color: [C.s[4], C.s[0], C.s[3]],
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
    color: [C.s[0], C.s[3]],
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
        lineStyle: { color: C.warn, type: "dashed" },
        label: { color: C.warn },
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
      <span class="badge ${o.locked ? "b-ok" : "b-stale"}">${o.locked ? "🔒 已锁定" : "🔓 没锁定"}</span>
      <span class="mono">${o.id}</span> <span class="dim">结算 ${o.settle_date ?? "—"} · p=${o.probability ?? "未填"}</span>
      <div class="cal-watch">${o.question ?? ""}</div>
    </div>`).join("");
  const mo = p.market_odds || {};
  const src = (label, o, color) => o && o.value != null
    ? `<span class="badge" style="color:${color};border:1px solid ${color}44;background:${color}14">
        ${label} ${(o.value * 100).toFixed(1)}%<span class="dim"> ${o.as_of ?? ""}</span></span>` : "";
  const oddsRow = `<div style="margin:6px 0 10px">
    <span class="dim">9月会不会加息？三个地方的报价（口径不同，只并列不混）：</span><br>
    ${src("期货算出来的", mo.zq_auto, C.s[0])}
    ${src("CME官网读的", mo.cme_manual, C.s[3])}
    ${src("押注市场", mo.polymarket, C.s[2])}
  </div>`;
  $("#predictions").innerHTML =
    `<div>开放 ${p.open} · 已结算 ${p.settled} · Brier <span class="mono">${p.brier ?? "—"}</span> (n=${p.n_for_brier})
      <span class="dim">${p.note ?? ""}</span></div>${oddsRow}${rows}`;
}

function renderRegime(rg) {
  if (!rg) return;
  const pct = rg.met / rg.total;
  const cls = pct >= 1 ? "b-fired" : pct >= 0.5 ? "b-stale" : "b-ok";
  const detail = rg.detail.map(d =>
    `${d.met ? "✓" : "·"} ${d.cond}(${d.value ?? "—"})`).join("  ");
  $("#regime-chip").innerHTML =
    `<span class="badge ${cls}" title="${rg.judge}">🎬 当前剧本：${rg.name} ${rg.met}/${rg.total}条件成立</span>
     <span class="dim mono">${detail}</span>`;
}

function renderRadar(radar) {
  $("#radar").innerHTML = (radar || []).map(r => {
    const crossed = r.distance_pct <= 0;
    const arrow = r.direction === "above" ? "↑" : "↓";
    return `<div class="tile ${crossed ? "crossed" : ""}" title="${r.rule_id}">
      <div class="label">${r.label} ${arrow}${fmt(r.threshold, 2)}</div>
      <div class="value">${fmt(r.value, Math.abs(r.value) > 100 ? 1 : 3)}</div>
      <div class="chg ${crossed ? "down" : "dim"}">${crossed
        ? "🔥 越线了" : `还差 ${fmt(Math.abs(r.distance_pct), 1)}%`}</div>
    </div>`;
  }).join("");
}

function relTime(iso) {
  if (!iso) return "";
  const h = (Date.now() - new Date(iso)) / 36e5;
  return h < 1 ? `${Math.round(h * 60)}m` : h < 48 ? `${Math.round(h)}h` : `${Math.round(h / 24)}d`;
}

const TAG_COLOR = { "债务链": C.s[7], "货币链": C.s[0], "日本链": C.s[4],
  "地缘链": C.s[1], "AI链": C.s[6], "黄金链": C.s[3], "数据": C.s[2], "其他": C.dim };

function renderNews(items) {
  $("#newslog").innerHTML = (items || []).slice(0, 25).map(n => {
    const chips = (n.tags || []).map(t =>
      `<span class="badge" style="color:${TAG_COLOR[t] ?? "#5f7692"};border:1px solid ${TAG_COLOR[t] ?? "#5f7692"}44;background:${TAG_COLOR[t] ?? "#5f7692"}14">${t}</span>`).join("");
    return `<div class="cal-item">
      ${chips}<a href="${n.link}" target="_blank" rel="noopener">${n.title}</a>
      <span class="dim mono"> ${n.source} · ${relTime(n.published)}</span>
    </div>`;
  }).join("") || "<div class='dim'>暂无</div>";
}

/* ---------- 页面路由（4页：home/reason/stock/data） ---------- */
const PAGES = ["home", "reason", "stock", "data"];
function showPage(tab) {
  if (!PAGES.includes(tab)) tab = "home";
  document.querySelectorAll("section[data-page]").forEach(s =>
    s.style.display = s.dataset.page === tab ? "" : "none");
  document.querySelectorAll("#tabs a").forEach(a =>
    a.classList.toggle("active", a.dataset.tab === tab));
  // 切页后resize图表（隐藏时初始化的图尺寸为0）
  requestAnimationFrame(() => {
    document.querySelectorAll(`section[data-page="${tab}"] .chart, #globe, #kline, #gex-profile`)
      .forEach(el => { const c = window.echarts && echarts.getInstanceByDom(el); if (c) c.resize(); });
    dispatchEvent(new Event("resize"));
    if (tab === "stock" && window.__kline) {
      const el = $("#kline");
      window.__kline.resize(el.clientWidth, el.clientHeight || 340);
    }
  });
}
addEventListener("hashchange", () => showPage(location.hash.slice(1)));

/* ---------- 推理页：逻辑链步进器 ---------- */
const NODE_ICON = { crossed: "🔥", near: "⚠️", quiet: "🟢", fact: "📌", manual: "✍️", no_data: "❔" };
const NODE_CLS = { crossed: "n-crossed", near: "n-near", quiet: "n-quiet",
  fact: "n-fact", manual: "n-fact", no_data: "n-nodata" };

function renderChains(chains) {
  $("#chains").innerHTML = (chains || []).map(ch => {
    const hot = ch.nodes.filter(n => n.status === "crossed").length;
    const nearN = ch.nodes.filter(n => n.status === "near").length;
    const headBadge = hot ? `<span class="badge b-fired">🔥 ${hot}环破了</span>`
      : nearN ? `<span class="badge b-stale">⚠️ ${nearN}环快到了</span>`
      : `<span class="badge b-ok">😴 安静</span>`;
    const nodes = ch.nodes.map(n => {
      const val = n.value != null
        ? `${fmt(n.value, Math.abs(n.value) > 100 ? 1 : 3)}<span class="dim">/${n.direction === "above" ? "↑" : "↓"}${fmt(n.threshold, Math.abs(n.threshold) > 100 ? 0 : 2)}</span>`
        : (n.value_text || "—");
      const dist = n.dist_pct != null
        ? (n.dist_pct <= 0 ? "破了！" : `还差${fmt(Math.abs(n.dist_pct), 1)}%`) : "";
      return `<div class="cnode ${NODE_CLS[n.status] ?? ""}" title="${n.note ?? ""}">
        <div class="cn-top" title="${n.term ?? ""} ${n.note ?? ""}">${NODE_ICON[n.status] ?? "·"} ${n.label}</div>
        <div class="cn-val mono">${val}</div>
        <div class="cn-dist dim">${dist || n.note?.slice(0, 14) || ""}</div>
      </div>`;
    }).join('<div class="carrow">→</div>');
    return `<div class="chain card">
      <div class="chain-head" onclick="this.parentElement.classList.toggle('open')">
        <b title="${ch.term ?? ""}">${ch.emoji ?? ""} ${ch.name}</b> ${headBadge}
        <div class="dim">${ch.one_liner}</div>
      </div>
      <div class="chain-nodes">${nodes}</div>
      <div class="chain-falsify dim">🗝️ 什么时候这条链失效：${ch.falsify}</div>
    </div>`;
  }).join("");
}

const VERDICT_STYLE = { "已证实": ["✅ 真的", "b-ok"], "已证伪": ["❌ 假的", "b-fired"],
  "未决": ["⏳ 还没定", "b-stale"], "假设(加样中)": ["🧪 在攒样本", "b-stale"], "事实": ["📌 事实", "b-ok"] };

function renderConclusions(list) {
  $("#conclusions").innerHTML = (list || []).map(c => {
    const [icon, cls] = VERDICT_STYLE[c.verdict] ?? ["·", "b-ok"];
    return `<div class="rule concl">
      <div class="head" onclick="this.parentElement.classList.toggle('open')">
        <span><span class="badge ${cls}">${icon}</span> <b>${c.claim}</b></span>
        <span class="dim mono">${c.date ?? ""}</span>
      </div>
      <div class="detail">
        ${c.number ? `<div class="inputs">${c.number}</div>` : ""}
        ${c.evidence ? `<div>证据：${c.evidence}</div>` : ""}
        ${c.so_what ? `<div style="color:#d8e6f5">含义：${c.so_what}</div>` : ""}
        ${c.source ? `<div class="mono">来源：${c.source}</div>` : ""}
      </div>
    </div>`;
  }).join("");
}

function renderInbox(items) {
  $("#inbox").innerHTML = (items || []).map(i =>
    `<div class="cal-item"><span class="cal-date">${i.mtime}</span>
     <a href="./${i.path}" target="_blank">${i.name}</a></div>`).join("")
    || `<div class="dim">空。把新文档丢进 repo 的 knowledge/inbox/ 并 push，就会出现在这里；
        下次对话说"整理inbox"即提炼进结论库。</div>`;
}

/* ---------- SPX K线 + gamma价位（lightweight-charts） ---------- */
function renderKline(ohlc, gex) {
  const el = $("#kline");
  if (!el || !window.LightweightCharts || !ohlc?.length) return;
  const chart = window.__kline = LightweightCharts.createChart(el, {
    layout: { background: { color: "transparent" }, textColor: C.dim,
      fontFamily: "Baloo 2" },
    grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
    rightPriceScale: { borderColor: C.grid },
    timeScale: { borderColor: C.grid },
    crosshair: { mode: 0 },
    autoSize: true,
  });
  const series = chart.addCandlestickSeries({
    upColor: C.good, downColor: C.bad,
    wickUpColor: C.good, wickDownColor: C.bad,
    borderVisible: false,
  });
  series.setData(ohlc.map(([t, o, h, l, c]) => ({ time: t, open: o, high: h, low: l, close: c })));
  const lines = [];
  if (gex && !gex.stale) {
    if (gex.call_wall) lines.push([gex.call_wall, C.good, "天花板"]);
    if (gex.put_wall && gex.put_wall !== gex.call_wall) lines.push([gex.put_wall, C.bad, "地板"]);
    if (gex.flip) lines.push([gex.flip, C.warn, "转性线"]);
  }
  for (const [price, color, title] of lines)
    series.createPriceLine({ price, color, title, lineStyle: 2, lineWidth: 1 });
  chart.timeScale().setVisibleLogicalRange({ from: ohlc.length - 60, to: ohlc.length + 2 });

  if (gex) {
    $("#gex-head").textContent = `磁力总量 ${fmt(gex.net_gex_bn, 1)}bn · 当日到期部分 ${fmt(gex.gex_0dte_bn, 1)}bn · ${gex.date}`;
    $("#gex-levels").innerHTML =
      `<span class="badge ${gex.net_gex_bn >= 0 ? "b-ok" : "b-fired"}">${gex.net_gex_bn >= 0 ? "🧲 吸铁石模式(压波动)" : "🚀 放大器模式(助趋势)"}</span>` +
      `转性线 <span class="mono" style="color:${C.warn}">${gex.flip ?? "—"}</span> · ` +
      `天花板 <span class="mono" style="color:${C.good}">${gex.call_wall ?? "—"}</span> · ` +
      `地板 <span class="mono" style="color:${C.bad}">${gex.put_wall ?? "—"}</span> · ` +
      `现价 <span class="mono">${fmt(gex.spot, 1)}</span>` +
      `<div class="dim">${gex.assumption ?? ""}</div>`;
  }
}

function renderGexProfile(gex) {
  if (!gex?.profile?.length) return;
  const spot = gex.spot;
  const rows = gex.profile.filter(([s]) => Math.abs(s - spot) / spot <= 0.04);
  lineChart("#gex-profile", {
    ...DARK,
    tooltip: { ...DARK.tooltip, trigger: "axis" },
    legend: { textStyle: { color: C.dim }, top: 0 },
    xAxis: { ...DARK.xAxis, data: rows.map(r => r[0]) },
    yAxis: yAxis({ name: "bn$/1%" }),
    series: [
      { name: "Call GEX", type: "bar", stack: "g", data: rows.map(r => r[1]),
        itemStyle: { color: C.good } },
      { name: "Put GEX", type: "bar", stack: "g", data: rows.map(r => r[2]),
        itemStyle: { color: C.bad },
        markLine: { silent: true, symbol: "none",
          lineStyle: { color: C.warn, type: "dashed" },
          label: { color: C.warn, formatter: "现价" },
          data: [{ xAxis: String(rows.reduce((best, r) =>
            Math.abs(r[0] - spot) < Math.abs(best - spot) ? r[0] : best, rows[0][0])) }] } },
    ],
  });
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
  renderRegime(data.regime);
  renderRadar(data.radar);
  renderNews(data.news);
  renderKline(data.spx_ohlc, data.gex);
  renderGexProfile(data.gex);
  const kn = data.knowledge || {};
  renderChains(kn.chains);
  renderConclusions(kn.conclusions);
  renderInbox(kn.inbox);
  showPage(location.hash.slice(1) || "home");
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

if ("serviceWorker" in navigator) navigator.serviceWorker.register("./sw.js").catch(() => {});
