/*
 * Ember to Ocean — tiny SVG chart renderer (line and bar). No dependencies.
 *
 * VR_CHART.render(element, {
 *   kind: "line" | "bar",
 *   series: [{ name, color, points: [{ x, label, value }] }],
 *   xFormat: v => string,   // line charts: formats numeric x values
 *   yLabel: "string"
 * })
 */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  function niceStep(range, target) {
    const raw = range / Math.max(1, target);
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / mag;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * mag;
  }
  function ticks(min, max, target) {
    if (min === max) { const pad = Math.abs(min) * 0.1 || 1; min -= pad; max += pad; }
    const step = niceStep(max - min, target);
    const out = [];
    for (let v = Math.floor(min / step) * step; v <= max + step * 0.5; v += step) out.push(+v.toPrecision(12));
    if (out[out.length - 1] < max) out.push(out[out.length - 1] + step);
    return out;
  }
  function fmt(v) {
    const a = Math.abs(v);
    if (a >= 1e9) return +(v / 1e9).toPrecision(3) + "B";
    if (a >= 1e6) return +(v / 1e6).toPrecision(3) + "M";
    if (a >= 1e4) return +(v / 1e3).toPrecision(3) + "k";
    return (+v.toPrecision(4)).toLocaleString();
  }
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

  function render(host, opts) {
    if (host._vrObserver) host._vrObserver.disconnect();
    host.classList.add("chart");
    const series = (opts.series || []).filter(s => s.points && s.points.length);
    if (!series.length) {
      host.innerHTML = '<div class="chart-empty">No numeric values to plot for this selection.</div>';
      return;
    }
    const draw = () => drawChart(host, opts, series);
    draw();
    let lastW = host.clientWidth;
    const ro = new ResizeObserver(() => { if (Math.abs(host.clientWidth - lastW) > 4) { lastW = host.clientWidth; draw(); } });
    ro.observe(host);
    host._vrObserver = ro;
  }

  function drawChart(host, opts, series) {
    host.innerHTML = "";
    const W = Math.max(280, host.clientWidth || 600);
    const H = Math.round(Math.min(340, Math.max(220, W * 0.42)));
    const kind = opts.kind || "line";
    const xFormat = opts.xFormat || (v => String(v));

    const allVals = series.flatMap(s => s.points.map(p => p.value)).filter(v => v != null && Number.isFinite(v));
    let yMin = Math.min(...allVals), yMax = Math.max(...allVals);
    if (kind === "bar" || yMin > 0 && yMin / (yMax || 1) < 0.35) yMin = Math.min(0, yMin);
    const yt = ticks(yMin, yMax, H < 260 ? 4 : 5);
    const y0 = yt[0], y1 = yt[yt.length - 1];
    const yLabels = yt.map(fmt);
    const m = { t: 14, r: 14, b: 38, l: Math.max(...yLabels.map(s => s.length)) * 7 + 18 };
    if (opts.yLabel) m.l += 16;
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const sy = v => m.t + ih - (v - y0) / (y1 - y0 || 1) * ih;

    const svg = el("svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: "img", "aria-label": opts.title || "Chart" }, null);
    const g = el("g", {}, svg);

    // grid + y axis
    yt.forEach((v, i) => {
      const y = sy(v);
      el("line", { x1: m.l, x2: m.l + iw, y1: y, y2: y, class: v === 0 ? "axis-zero" : "grid" }, g);
      const t = el("text", { x: m.l - 8, y: y + 4, "text-anchor": "end", class: "tick" }, g);
      t.textContent = yLabels[i];
    });
    if (opts.yLabel) {
      const t = el("text", { x: 0, y: 0, transform: `translate(12 ${m.t + ih / 2}) rotate(-90)`, "text-anchor": "middle", class: "axis-label" }, g);
      t.textContent = opts.yLabel.length > 40 ? opts.yLabel.slice(0, 38) + "…" : opts.yLabel;
    }
    el("line", { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, class: "axis" }, g);

    let hoverXs = []; // [{px, label, rows:[{name,color,value}]}]

    if (kind === "line") {
      const xs = [...new Set(series.flatMap(s => s.points.map(p => p.x)))].sort((a, b) => a - b);
      const xMin = xs[0], xMax = xs[xs.length - 1];
      const sx = v => xMin === xMax ? m.l + iw / 2 : m.l + (v - xMin) / (xMax - xMin) * iw;
      // x ticks: choose up to ~W/90 labels from the actual x values
      const maxLabels = Math.max(2, Math.floor(iw / 80));
      const stride = Math.ceil(xs.length / maxLabels);
      xs.forEach((v, i) => {
        if (i % stride !== 0 && i !== xs.length - 1) return;
        if (i === xs.length - 1 && i % stride !== 0 && xs.length > 1 && sx(v) - sx(xs[i - (i % stride)]) < 50) return;
        const t = el("text", { x: sx(v), y: m.t + ih + 18, "text-anchor": "middle", class: "tick" }, g);
        t.textContent = xFormat(v);
        el("line", { x1: sx(v), x2: sx(v), y1: m.t + ih, y2: m.t + ih + 4, class: "axis" }, g);
      });
      for (const s of series) {
        const pts = s.points.filter(p => p.value != null).sort((a, b) => a.x - b.x);
        const d = pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.value).toFixed(1)}`).join("");
        const attrs = { d, fill: "none", stroke: s.color, "stroke-width": s.width || 2, "stroke-linejoin": "round", "stroke-linecap": "round" };
        if (s.dash) attrs["stroke-dasharray"] = s.dash;
        el("path", attrs, g);
        if (!s.noDots && pts.length <= 60) pts.forEach(p => el("circle", { cx: sx(p.x), cy: sy(p.value), r: 3, fill: s.color, class: "dot" }, g));
      }
      if (opts.markX != null && opts.markX >= xMin && opts.markX <= xMax) {
        el("line", { x1: sx(opts.markX), x2: sx(opts.markX), y1: m.t, y2: m.t + ih, class: "mark" }, g);
      }
      hoverXs = xs.map(v => ({
        px: sx(v), label: xFormat(v),
        rows: series.filter(s => !s.noHover).map(s => { const p = s.points.find(q => q.x === v); return { name: s.name, color: s.color, value: p ? p.value : null }; })
      }));
    } else {
      const cats = [...new Set(series.flatMap(s => s.points.map(p => p.label)))];
      const band = iw / cats.length;
      const inner = band * 0.72 / series.length;
      const maxLabels = Math.max(2, Math.floor(iw / 70));
      const stride = Math.ceil(cats.length / maxLabels);
      cats.forEach((c, ci) => {
        const cx = m.l + band * ci + band / 2;
        if (ci % stride === 0) {
          const t = el("text", { x: cx, y: m.t + ih + 18, "text-anchor": "middle", class: "tick" }, g);
          t.textContent = c.length > 14 ? c.slice(0, 13) + "…" : c;
        }
        series.forEach((s, si) => {
          const p = s.points.find(q => q.label === c);
          if (!p || p.value == null) return;
          const x = m.l + band * ci + band * 0.14 + inner * si;
          const ya = sy(Math.max(0, y0)), yb = sy(p.value);
          el("rect", { x, y: Math.min(ya, yb), width: Math.max(1, inner - 1), height: Math.max(1, Math.abs(ya - yb)), fill: s.color, rx: 1 }, g);
        });
      });
      hoverXs = cats.map((c, ci) => ({
        px: m.l + band * ci + band / 2, label: c,
        rows: series.map(s => { const p = s.points.find(q => q.label === c); return { name: s.name, color: s.color, value: p ? p.value : null }; })
      }));
    }

    // hover
    const guide = el("line", { x1: 0, x2: 0, y1: m.t, y2: m.t + ih, class: "guide", visibility: "hidden" }, g);
    const overlay = el("rect", { x: m.l, y: m.t, width: iw, height: ih, fill: "transparent" }, g);
    const tip = document.createElement("div");
    tip.className = "chart-tip";
    tip.hidden = true;

    const onMove = ev => {
      const rect = svg.getBoundingClientRect();
      const px = (ev.clientX - rect.left) * (W / rect.width);
      let best = hoverXs[0], bd = Infinity;
      for (const h of hoverXs) { const dd = Math.abs(h.px - px); if (dd < bd) { bd = dd; best = h; } }
      guide.setAttribute("x1", best.px); guide.setAttribute("x2", best.px); guide.setAttribute("visibility", "visible");
      tip.innerHTML = `<div class="tip-x">${esc(best.label)}</div>` + best.rows.map(r =>
        `<div class="tip-row"><span class="sw" style="background:${r.color}"></span>${best.rows.length > 1 ? esc(r.name) + ": " : ""}<b>${r.value == null ? "—" : esc(fmtFull(r.value))}</b></div>`).join("");
      tip.hidden = false;
      const left = best.px * (rect.width / W);
      tip.style.left = Math.min(rect.width - tip.offsetWidth - 4, Math.max(4, left + 12)) + "px";
      tip.style.top = "8px";
    };
    overlay.addEventListener("pointermove", onMove);
    overlay.addEventListener("pointerdown", onMove);
    overlay.addEventListener("pointerleave", () => { tip.hidden = true; guide.setAttribute("visibility", "hidden"); });

    host.appendChild(svg);
    host.appendChild(tip);
    if (series.length > 1 && !opts.noLegend) {
      const lg = document.createElement("div");
      lg.className = "chart-legend";
      lg.innerHTML = series.map(s => `<span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span>`).join("");
      host.appendChild(lg);
    }
  }

  function fmtFull(v) {
    const a = Math.abs(v);
    return v.toLocaleString(undefined, { maximumFractionDigits: a >= 1000 ? 0 : a >= 10 ? 2 : 4 });
  }

  window.VR_CHART = { render, fmt, fmtFull };
})();
