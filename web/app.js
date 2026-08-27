/* 看板：唯一数据源 data/latest.json（契约见规格书§7） */
const $ = (s) => document.querySelector(s);
const fmt = (v, d = 2) => (v == null ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));

const SNAPSHOT_KEYS = ["spx", "vix", "gold", "silver", "dxy", "usdjpy", "brent",
  "us10y", "us30y", "tips10y", "move", "avg_rate"];

const DARK = {
  textStyle: { color: "#8b949e" },
  grid: { left: 48, right: 48, top: 24, bottom: 28 },
  xAxis: { type: "category", axisLine: { lineStyle: { color: "#30363d" } }, axisLabel: { color: "#8b949e" } },
  tooltip: { trigger: "axis", backgroundColor: "#161b22", borderColor: "#30363d", textStyle: { color: "#e6edf3" } },
};
const yAxis = (opts = {}) => ({
  type: "value", scale: true,
  splitLine: { lineStyle: { color: "#21262d" } },
  axisLabel: { color: "#8b949e" }, ...opts,
});

function chgClass(v) { return v == null ? "" : v >= 0 ? "up" : "down"; }

function renderHealth(h) {
  const ok = h.stale === 0;
  $("#health-summary").innerHTML =
    `<span class="badge ${ok ? "b-ok" : "b-stale"}">${h.ok}/${h.total_sources} ok</span>` +
    (ok ? "全部数据源新鲜" : `${h.stale} 个源陈旧（已排除出规则判定）`);
  $("#stale-list").innerHTML = h.stale_list.map(s =>
    `<div class="dim">⚠ <code>${s.key}</code> as_of=${s.as_of ?? "—"} · ${s.reason}</div>`).join("");
}

function renderSnapshot(metrics) {
  const by = Object.fromEntries(metrics.map(m => [m.key, m]));
  $("#snapshot").innerHTML = SNAPSHOT_KEYS.filter(k => by[k]).map(k => {
    const m = by[k];
    const chg = m.chg_1d_pct != null ? `${m.chg_1d_pct > 0 ? "+" : ""}${fmt(m.chg_1d_pct)}%`
      : m.chg_1d != null ? `${m.chg_1d > 0 ? "+" : ""}${fmt(m.chg_1d, 3)}` : "";
    return `<div class="tile ${m.stale ? "stale" : ""}" title="${m.source}">
      <div class="label">${m.label}</div>
      <div class="value">${fmt(m.value, m.value > 1000 ? 0 : 2)}<span class="dim">${m.unit === "%" ? "%" : ""}</span></div>
      <div class="chg ${chgClass(m.chg_1d_pct ?? m.chg_1d)}">${chg}</div>
      <div class="asof">${m.as_of ?? ""} · ${m.source.split(":")[0]}</div>
    </div>`;
  }).join("");
}

function renderRules(rules) {
  const order = { fired: 0, fired_muted: 1, skipped: 2, manual: 3, not_fired: 4 };
  const sorted = [...rules].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  const fired = rules.filter(r => r.status === "fired" || r.status === "fired_muted").length;
  $("#rules-count").textContent = `触发 ${fired} / 共 ${rules.length}`;
  $("#rules").innerHTML = sorted.map(r => {
    const label = { fired: "触发", fired_muted: "触发(静默)", not_fired: "未触发",
      skipped: "跳过", manual: "人工" }[r.status] ?? r.status;
    const inputs = Object.entries(r.inputs || {}).map(([k, v]) => `${k}=${v}`).join(" ");
    return `<div class="rule ${r.status}">
      <div class="head" onclick="this.parentElement.classList.toggle('open')">
        <span><b>${r.name}</b> <span class="dim">${r.id}</span></span>
        <span class="dim">${label} · ${r.severity}</span>
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

function renderTic(tic, series) {
  if (!tic?.length) return;
  $("#tic-asof").textContent = `as_of ${tic[0].as_of}（月度，滞后约6周）`;
  $("#tic-latest").innerHTML = tic.map(t =>
    `<span class="badge ${t.chg_bn < 0 ? "b-fired" : "b-ok"}">
      ${t.country} ${fmt(t.holdings_bn, 1)}bn（${t.chg_bn > 0 ? "+" : ""}${fmt(t.chg_bn, 1)}）</span>`).join(" ");
  const keys = [["tic_japan", "Japan"], ["tic_uk", "UK"], ["tic_china", "China"]];
  const chart = echarts.init($("#tic-chart"));
  chart.setOption({
    ...DARK,
    legend: { textStyle: { color: "#8b949e" }, top: 0 },
    xAxis: { ...DARK.xAxis, data: (series.tic_japan || []).map(p => p[0].slice(0, 7)) },
    yAxis: yAxis({ name: "bn USD" }),
    series: keys.filter(([k]) => series[k]).map(([k, name]) => ({
      name, type: "line", smooth: true, symbol: "circle", symbolSize: 5,
      data: (series[k] || []).map(p => p[1]),
    })),
  });
}

function dualAxis(el, s1, s2, name1, name2) {
  if (!s1?.length) return;
  const dates = s1.map(p => p[0]);
  const m2 = new Map((s2 || []).map(p => [p[0], p[1]]));
  const chart = echarts.init($(el));
  chart.setOption({
    ...DARK,
    legend: { textStyle: { color: "#8b949e" }, top: 0 },
    xAxis: { ...DARK.xAxis, data: dates },
    yAxis: [yAxis({ name: name1 }), yAxis({ name: name2, splitLine: { show: false } })],
    series: [
      { name: name1, type: "line", showSymbol: false, data: s1.map(p => p[1]) },
      { name: name2, type: "line", showSymbol: false, yAxisIndex: 1, data: dates.map(d => m2.get(d) ?? null), connectNulls: true },
    ],
  });
}

function singleLine(el, s, name, marks = []) {
  if (!s?.length) return;
  const chart = echarts.init($(el));
  chart.setOption({
    ...DARK,
    xAxis: { ...DARK.xAxis, data: s.map(p => p[0]) },
    yAxis: yAxis(),
    series: [{
      name, type: "line", showSymbol: false, data: s.map(p => p[1]),
      markLine: marks.length ? {
        silent: true, symbol: "none",
        lineStyle: { color: "#d29922", type: "dashed" },
        label: { color: "#d29922" },
        data: marks.map(v => ({ yAxis: v })),
      } : undefined,
    }],
  });
}

function ratioLine(el, s1, s2, name) {
  if (!s1?.length || !s2?.length) return;
  const m2 = new Map(s2.map(p => [p[0], p[1]]));
  const data = s1.filter(p => m2.has(p[0])).map(p => [p[0], +(p[1] / m2.get(p[0])).toFixed(4)]);
  singleLine(el, data, name);
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
      <span class="badge ${o.locked ? "b-ok" : "b-stale"}">${o.locked ? "已锁定" : "未锁定"}</span>
      ${o.id} <span class="dim">结算 ${o.settle_date ?? "—"} · p=${o.probability ?? "未填"}</span>
      <div class="cal-watch">${o.question ?? ""}</div>
    </div>`).join("");
  $("#predictions").innerHTML =
    `<div>开放 ${p.open} · 已结算 ${p.settled} · Brier ${p.brier ?? "—"} (n=${p.n_for_brier})
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
  $("#gen-time").textContent = `更新 ${data.generated_at} UTC`;
  renderHealth(data.health);
  renderSnapshot(data.metrics);
  renderRules(data.rules);
  renderAuctions(data.auctions);
  renderTic(data.tic, data.series);
  renderCalendar(data.calendar);
  renderPredictions(data.predictions);
  const s = data.series || {};
  dualAxis("#chart-tips-gold", s.tips10y, s.gold, "TIPS10Y %", "Gold $");
  ratioLine("#chart-spx-gold", s.spx, s.gold, "SPX/Gold");
  singleLine("#chart-curve", s.curve_10y2y, "10Y-2Y %", [0]);
  singleLine("#chart-cot", s.cot_gold, "COT净多(张)");
  singleLine("#chart-30y", s.us30y, "30Y %", [5.33, 5.5]);
  addEventListener("resize", () => document.querySelectorAll(".chart").forEach(el => {
    const c = echarts.getInstanceByDom(el); if (c) c.resize();
  }));
}
main();
