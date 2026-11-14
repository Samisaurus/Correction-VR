/*
 * Ember to Ocean — 2.5D country map on a <canvas>. No dependencies.
 *
 * const map = VR_MAP.create(hostElement, { colors: { fire, air, water, near } });
 * map.setCountry(polygons, [centerLon, centerLat]);   // polygons: [[ring, hole…], …], ring: [[lon,lat],…]
 * map.setLayers({ fires: [{lat, lon, w}], air: [{lat, lon, v}], airLevel: 0..1|null,
 *                 water: [{lat, lon, v}], nearKm, labels: {fire, air, water} });
 *
 * Projection: Lambert azimuthal equal-area centred on the country, then a
 * perspective camera tilted towards the horizon (drag to rotate and tilt).
 */
(function () {
  "use strict";
  const D2R = Math.PI / 180;
  const CAM = 3.6;          // camera distance in plane units (plane spans about -1..1)
  const SLAB = 0.035;       // thickness of the land slab

  function projector(center) {
    const l0 = center[0] * D2R, p0 = center[1] * D2R, s0 = Math.sin(p0), c0 = Math.cos(p0);
    return (lon, lat) => {
      const l = lon * D2R, p = lat * D2R, dl = l - l0;
      const cosc = s0 * Math.sin(p) + c0 * Math.cos(p) * Math.cos(dl);
      if (1 + cosc < 1e-9) return null;
      const k = Math.sqrt(2 / (1 + cosc));
      return [k * Math.cos(p) * Math.sin(dl), k * (c0 * Math.sin(p) - s0 * Math.cos(p) * Math.cos(dl))];
    };
  }
  function haversineKm(a, b) {
    const dLat = (b.lat - a.lat) * D2R, dLon = (b.lon - a.lon) * D2R;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * D2R) * Math.cos(b.lat * D2R) * Math.sin(dLon / 2) ** 2;
    return 12742 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  const css = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback;
  function rgba(hex, a) {
    const h = hex.replace("#", ""), n = parseInt(h.length === 3 ? h.replace(/./g, c => c + c) : h, 16);
    return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`;
  }

  // marching squares → line segments in grid coordinates
  function isolines(g, gw, gh, l) {
    const segs = [];
    const t = (a, b) => (l - a) / (b - a || 1e-12);
    for (let j = 0; j < gh - 1; j++) for (let i = 0; i < gw - 1; i++) {
      const v0 = g[j * gw + i], v1 = g[j * gw + i + 1], v2 = g[(j + 1) * gw + i + 1], v3 = g[(j + 1) * gw + i];
      const idx = (v0 > l) | (v1 > l) << 1 | (v2 > l) << 2 | (v3 > l) << 3;
      if (idx === 0 || idx === 15) continue;
      const e = [() => [i + t(v0, v1), j], () => [i + 1, j + t(v1, v2)], () => [i + t(v3, v2), j + 1], () => [i, j + t(v0, v3)]];
      const pairs = { 1: [[3, 0]], 2: [[0, 1]], 3: [[3, 1]], 4: [[1, 2]], 5: [[3, 0], [1, 2]], 6: [[0, 2]], 7: [[3, 2]], 8: [[2, 3]],
        9: [[0, 2]], 10: [[0, 1], [2, 3]], 11: [[1, 2]], 12: [[1, 3]], 13: [[0, 1]], 14: [[0, 3]] }[idx];
      for (const [a, b] of pairs) segs.push([e[a](), e[b]()]);
    }
    return segs;
  }
  function blur(g, w, h, r) {
    const tmp = new Float32Array(g.length);
    for (let pass = 0; pass < 3; pass++) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const xx = x + k; if (xx >= 0 && xx < w) { s += g[y * w + xx]; n++; } }
        tmp[y * w + x] = s / n;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let s = 0, n = 0;
        for (let k = -r; k <= r; k++) { const yy = y + k; if (yy >= 0 && yy < h) { s += tmp[yy * w + x]; n++; } }
        g[y * w + x] = s / n;
      }
    }
  }

  function create(host, opts) {
    host.classList.add("map");
    host.innerHTML = `<canvas aria-label="Map"></canvas>
      <div class="map-ctrl" role="group" aria-label="Map controls">
        <button type="button" data-z="in" title="Zoom in">+</button><button type="button" data-z="out" title="Zoom out">−</button>
        <button type="button" data-z="flat" title="Toggle 2D / 2.5D">2D</button><button type="button" data-z="reset" title="Reset view">⟲</button></div>
      <div class="map-tip" hidden></div><div class="map-help">Drag to rotate and tilt · Shift-drag to pan · Double-click to zoom</div>`;
    const canvas = host.querySelector("canvas"), ctx = canvas.getContext("2d"), tip = host.querySelector(".map-tip");
    const colors = opts.colors;
    const DEFAULT = { rot: 0, tilt: 50 * D2R, zoom: 1, panX: 0, panY: 0 };
    let view = Object.assign({}, DEFAULT);
    let W = 600, H = 380, dpr = 1;
    let world = null;   // { proj, toPlane, rings, bbox, grat }
    let layer = null;   // processed layers
    let hits = [];

    /* -------- geometry */
    function setCountry(polygons, center) {
      const proj = projector(center);
      const raw = polygons.map(poly => poly.map(ring => ring.map(([lo, la]) => proj(lo, la)).filter(Boolean)));
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      let lo0 = Infinity, lo1 = -Infinity, la0 = Infinity, la1 = -Infinity;
      for (const poly of raw) for (const [x, y] of poly[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      for (const poly of polygons) for (let [lo, la] of poly[0]) {
        lo = ((lo - center[0] + 540) % 360) - 180 + center[0];
        lo0 = Math.min(lo0, lo); lo1 = Math.max(lo1, lo); la0 = Math.min(la0, la); la1 = Math.max(la1, la);
      }
      const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, s = 2 / Math.max(x1 - x0, y1 - y0);
      const toPlane = (lon, lat) => { const p = proj(lon, lat); return p ? [(p[0] - cx) * s, (p[1] - cy) * s] : null; };
      const rings = raw.map(poly => poly.map(ring => ring.map(([x, y]) => [(x - cx) * s, (y - cy) * s])));
      const bbox = [(x0 - cx) * s, (y0 - cy) * s, (x1 - cx) * s, (y1 - cy) * s];
      // graticule every 10°
      const grat = [];
      const step = 10;
      for (let lo = Math.ceil(lo0 / step) * step; lo <= lo1; lo += step) {
        const line = []; for (let la = Math.max(-85, la0 - 2); la <= Math.min(85, la1 + 2); la += 1) { const p = toPlane(lo, la); if (p) line.push(p); } grat.push(line);
      }
      for (let la = Math.ceil(la0 / step) * step; la <= la1; la += step) {
        const line = []; for (let lo = lo0 - 2; lo <= lo1 + 2; lo += 1) { const p = toPlane(lo, la); if (p) line.push(p); } grat.push(line);
      }
      world = { toPlane, rings, bbox, grat };
      view = Object.assign({}, DEFAULT);
      layer = null;
      draw();
    }

    function setLayers(L) {
      if (!world) return;
      const [bx0, by0, bx1, by1] = world.bbox;
      const inBox = p => p && p[0] > bx0 - 0.2 && p[0] < bx1 + 0.2 && p[1] > by0 - 0.2 && p[1] < by1 + 0.2;
      // fire cells
      const N = 46, cs = 2 / N, cells = new Map();
      let fireMax = 0;
      const GW = 96, GH = Math.max(8, Math.round(96 * (by1 - by0) / (bx1 - bx0 || 1)));
      const dens = new Float32Array(GW * GH);
      for (const f of L.fires || []) {
        const p = world.toPlane(f.lon, f.lat); if (!inBox(p)) continue;
        const k = Math.floor(p[0] / cs) + "," + Math.floor(p[1] / cs);
        let c = cells.get(k);
        if (!c) { c = { x: (Math.floor(p[0] / cs) + 0.5) * cs, y: (Math.floor(p[1] / cs) + 0.5) * cs, w: 0, n: 0, lat: 0, lon: 0 }; cells.set(k, c); }
        c.w += f.w; c.n++; c.lat += f.lat; c.lon += f.lon;
        const gi = Math.round((p[0] - bx0) / (bx1 - bx0) * (GW - 1)), gj = Math.round((p[1] - by0) / (by1 - by0) * (GH - 1));
        if (gi >= 0 && gi < GW && gj >= 0 && gj < GH) dens[gj * GW + gi] += f.w;
      }
      const fireCells = [...cells.values()];
      fireCells.forEach(c => { c.lat /= c.n; c.lon /= c.n; fireMax = Math.max(fireMax, c.w); });
      let contours = [];
      if (fireCells.length > 2) {
        blur(dens, GW, GH, 2);
        let m = 0; for (const v of dens) m = Math.max(m, v);
        if (m > 0) contours = [0.08, 0.22, 0.45, 0.7].map(f => isolines(dens, GW, GH, m * f).map(seg => seg.map(([i, j]) =>
          [bx0 + i / (GW - 1) * (bx1 - bx0), by0 + j / (GH - 1) * (by1 - by0)])));
      }
      // air
      const airV = (L.air || []).map(a => a.v).filter(Number.isFinite);
      const aMin = Math.min(...airV), aMax = Math.max(...airV);
      const air = (L.air || []).map(a => ({ p: world.toPlane(a.lon, a.lat), t: aMax > aMin ? (a.v - aMin) / (aMax - aMin) : 0.6, a })).filter(a => inBox(a.p));
      // water, flag near fires
      const near = L.nearKm || 50;
      const water = (L.water || []).map(w => {
        const p = world.toPlane(w.lon, w.lat);
        let nearFire = false;
        const dLat = near / 111, dLon = near / (111 * Math.max(0.05, Math.cos(w.lat * D2R)));
        for (const f of L.fires || []) {
          if (Math.abs(f.lat - w.lat) > dLat || Math.abs(((f.lon - w.lon + 540) % 360) - 180) > dLon) continue;
          if (haversineKm(f, w) <= near) { nearFire = true; break; }
        }
        return { p, w, nearFire };
      }).filter(w => inBox(w.p));
      layer = { fireCells, fireMax, contours, air, airLevel: L.airLevel, water, labels: L.labels || {} };
      draw();
    }

    /* -------- camera */
    function cam() {
      const [bx0, by0, bx1, by1] = world.bbox;
      const hw = (bx1 - bx0) / 2, hh = (by1 - by0) / 2;
      const ct = Math.cos(view.tilt);
      const scale = Math.min(W * 0.47 / hw, H * 0.44 / (hh * ct + 0.12)) * view.zoom;
      return { scale, cx: W / 2, cy: H * 0.5 + (view.tilt > 0.1 ? H * 0.03 : 0), cr: Math.cos(view.rot), sr: Math.sin(view.rot), ct, st: Math.sin(view.tilt) };
    }
    function P(c, x, y, z) {
      x -= view.panX; y -= view.panY;
      const xr = x * c.cr - y * c.sr, yr = x * c.sr + y * c.cr;
      const Y = yr * c.ct + z * c.st, depth = yr * c.st - z * c.ct;
      const k = CAM / (CAM + depth);
      return [c.cx + xr * k * c.scale, c.cy - Y * k * c.scale, depth, k];
    }
    function unproject(c, sx, sy) {
      const X = (sx - c.cx) / c.scale, Y = (c.cy - sy) / c.scale;
      const yr = Y * CAM / (c.ct * CAM - Y * c.st), xr = X * (CAM + yr * c.st) / CAM;
      return [xr * c.cr + yr * c.sr + view.panX, -xr * c.sr + yr * c.cr + view.panY];
    }

    /* -------- drawing */
    function ringPath(c, z) {
      ctx.beginPath();
      for (const poly of world.rings) for (const ring of poly) {
        ring.forEach(([x, y], i) => { const s = P(c, x, y, z); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); });
        ctx.closePath();
      }
    }
    function draw() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      hits = [];
      if (!world) return;
      const c = cam();
      const land = css("--map-land", "#fbf8f0"), edge = css("--map-edge", "#8a8f94"), side = css("--map-side", "#d9d2c1"), grid = css("--map-grid", "#e2ddd0");

      // sea graticule (outside the land, faint)
      ctx.lineWidth = 0.6; ctx.strokeStyle = grid; ctx.globalAlpha = 0.6;
      for (const line of world.grat) { ctx.beginPath(); line.forEach(([x, y], i) => { const s = P(c, x, y, 0); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
      ctx.globalAlpha = 1;

      // land slab (2.5D thickness)
      if (view.tilt > 0.05) { ringPath(c, -SLAB); ctx.fillStyle = side; ctx.fill("evenodd"); ctx.strokeStyle = side; ctx.lineWidth = 1; ctx.stroke(); }
      ringPath(c, 0); ctx.fillStyle = land; ctx.fill("evenodd");

      ctx.save(); ringPath(c, 0); ctx.clip("evenodd");
      // graticule on land
      ctx.lineWidth = 0.7; ctx.strokeStyle = grid;
      for (const line of world.grat) { ctx.beginPath(); line.forEach(([x, y], i) => { const s = P(c, x, y, 0); i ? ctx.lineTo(s[0], s[1]) : ctx.moveTo(s[0], s[1]); }); ctx.stroke(); }
      if (layer) {
        // national air level tint
        if (layer.airLevel != null && !layer.air.length) { ringPath(c, 0); ctx.fillStyle = rgba(colors.air, 0.08 + 0.32 * layer.airLevel); ctx.fill("evenodd"); }
        // air haze
        for (const a of layer.air) {
          const s = P(c, a.p[0], a.p[1], 0), r = (0.07 + 0.08 * a.t) * c.scale * s[3];
          const g = ctx.createRadialGradient(s[0], s[1], 0, s[0], s[1], r);
          g.addColorStop(0, rgba(colors.air, 0.18 + 0.4 * a.t)); g.addColorStop(1, rgba(colors.air, 0));
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(s[0], s[1], r, r * Math.max(0.35, c.ct), 0, 0, Math.PI * 2); ctx.fill();
          hits.push({ x: s[0], y: s[1], r: 10, text: `${layer.labels.air || "Air"}: ${fmt(a.a.v)}`, prio: 0 });
        }
        // fire density contours
        layer.contours.forEach((segs, li) => {
          ctx.strokeStyle = rgba(colors.fire, 0.35 + li * 0.15); ctx.lineWidth = 0.8 + li * 0.35;
          ctx.beginPath();
          for (const [a, b] of segs) { const p = P(c, a[0], a[1], 0), q = P(c, b[0], b[1], 0); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); }
          ctx.stroke();
        });
      }
      ctx.restore();
      ringPath(c, 0); ctx.strokeStyle = edge; ctx.lineWidth = 0.9; ctx.stroke();

      if (!layer) return;
      // water sites
      for (const w of layer.water) {
        const s = P(c, w.p[0], w.p[1], 0), col = w.nearFire ? colors.near : colors.water, r = w.nearFire ? 4.5 : 3.5;
        ctx.beginPath(); ctx.ellipse(s[0], s[1], r, r * Math.max(0.5, c.ct), 0, 0, Math.PI * 2);
        ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = land; ctx.stroke();
        if (w.nearFire) { ctx.beginPath(); ctx.ellipse(s[0], s[1], r + 3, (r + 3) * Math.max(0.5, c.ct), 0, 0, Math.PI * 2); ctx.strokeStyle = col; ctx.stroke(); }
        hits.push({ x: s[0], y: s[1], r: 8, text: `${layer.labels.water || "Water"}: ${fmt(w.w.v)}${w.nearFire ? " · near a fire this year" : ""}`, prio: 2 });
      }
      // fire columns, far to near
      const cols = layer.fireCells.map(f => ({ f, b: P(c, f.x, f.y, 0) })).sort((a, b) => b.b[2] - a.b[2]);
      const hmax = view.tilt > 0.05 ? 0.32 : 0;
      for (const { f, b } of cols) {
        const t = Math.sqrt(f.w / (layer.fireMax || 1));
        const top = P(c, f.x, f.y, hmax * t + 0.004);
        ctx.strokeStyle = rgba(colors.fire, 0.55 + 0.4 * t);
        ctx.lineWidth = Math.max(2, 4.2 * b[3] * Math.min(1.6, view.zoom));
        ctx.lineCap = "round";
        if (hmax) { ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.lineTo(top[0], top[1]); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(top[0], top[1], hmax ? 2 + 2.5 * t : 2.5 + 4 * t, 0, Math.PI * 2);
        ctx.fillStyle = colors.fire; ctx.fill();
        hits.push({ x: top[0], y: top[1], r: 9, text: `${layer.labels.fire || "Fire"}: ${fmt(f.w)}${f.n > 1 ? ` (${f.n.toLocaleString()} records)` : ""}`, prio: 3 });
      }
    }
    function fmt(v) { return v == null ? "—" : (window.VR_CHART ? window.VR_CHART.fmtFull(v) : String(v)); }

    /* -------- interaction */
    function resize() {
      W = Math.max(260, host.clientWidth);
      H = Math.round(Math.min(560, Math.max(300, W * 0.64)));
      dpr = window.devicePixelRatio || 1;
      canvas.width = W * dpr; canvas.height = H * dpr;
      canvas.style.width = W + "px"; canvas.style.height = H + "px";
      draw();
    }
    let drag = null;
    canvas.addEventListener("pointerdown", e => { drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2 }; canvas.setPointerCapture(e.pointerId); tip.hidden = true; });
    canvas.addEventListener("pointermove", e => {
      if (drag) {
        const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY;
        if (drag.pan) {
          const c = cam(), k = 1 / c.scale;
          view.panX -= (dx * c.cr + dy * c.sr / Math.max(.3, c.ct)) * k;
          view.panY -= (dx * c.sr - dy * c.cr / Math.max(.3, c.ct)) * k;
        } else {
          view.rot += dx * 0.006;
          view.tilt = Math.min(1.2, Math.max(0, view.tilt + dy * 0.005));
        }
        draw(); return;
      }
      const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = Infinity;
      for (const h of hits) { const d = Math.hypot(h.x - x, h.y - y) - h.prio; if (d < h.r && d < bd) { bd = d; best = h; } }
      if (best) { tip.textContent = best.text; tip.hidden = false; tip.style.left = Math.min(W - tip.offsetWidth - 6, x + 12) + "px"; tip.style.top = Math.max(4, y - 30) + "px"; }
      else tip.hidden = true;
    });
    const end = () => { drag = null; };
    canvas.addEventListener("pointerup", end); canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("pointerleave", () => { tip.hidden = true; });
    canvas.addEventListener("contextmenu", e => e.preventDefault());
    canvas.addEventListener("wheel", e => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault(); view.zoom = Math.min(12, Math.max(0.6, view.zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15))); draw();
    }, { passive: false });
    canvas.addEventListener("dblclick", e => {
      if (!world) return;
      const r = canvas.getBoundingClientRect(), c = cam();
      const [x, y] = unproject(c, e.clientX - r.left, e.clientY - r.top);
      if (Number.isFinite(x) && Number.isFinite(y)) { view.panX = x; view.panY = y; }
      view.zoom = Math.min(12, view.zoom * 1.8); draw();
    });
    host.querySelector(".map-ctrl").addEventListener("click", e => {
      const b = e.target.closest("button"); if (!b) return;
      const z = b.dataset.z;
      if (z === "in") view.zoom = Math.min(12, view.zoom * 1.4);
      if (z === "out") view.zoom = Math.max(0.6, view.zoom / 1.4);
      if (z === "reset") view = Object.assign({}, DEFAULT);
      if (z === "flat") view.tilt = view.tilt > 0.05 ? 0 : DEFAULT.tilt;
      b.textContent = z === "flat" ? (view.tilt > 0.05 ? "2D" : "2.5D") : b.textContent;
      draw();
    });
    new ResizeObserver(() => { if (Math.abs(host.clientWidth - W) > 2) resize(); }).observe(host);
    resize();
    return { setCountry, setLayers, redraw: draw };
  }

  window.VR_MAP = { create };
})();
