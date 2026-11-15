// js/charts/fig4-outlook.js
// Purpose: Fig. 4 (#outlook) — Wildfire Horizon & Interactive AI Trend Setter beneath Fig. 3.
//          Combines Theil-Sen statistical momentum, 2027-2035 horizon toggles, warming stress slider,
//          predicted globe hotspot rings, and conversational Gemini AI analysis (/api/forecast & /api/ask).

import { HORIZONS, buildDeterministicAnswer, buildDeterministicBrief, computeForecast, summarizeScopeContext } from '../forecast.js';

const STYLE = `
.f4-root { padding: 14px 18px 13px; display: flex; flex-direction: column; gap: 11px; }
.f4-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; }
.f4-title-wrap { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.f4-title { font-family: var(--f-serif); font-size: 16px; font-weight: 700; margin: 0; color: var(--c-ink); }
.f4-sub { font-family: var(--f-mono); font-size: 11px; color: var(--c-muted); font-variant-numeric: tabular-nums; }
.f4-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.f4-seg {
  display: inline-flex; padding: 2px; gap: 2px;
  background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 6px;
}
.f4-seg button {
  border: 1px solid transparent; border-radius: 4px; padding: 3px 9px;
  font-family: var(--f-mono); font-size: 11.5px; font-weight: 600;
  color: var(--c-muted); background: transparent; line-height: 1.25;
}
.f4-seg button[aria-pressed="true"] {
  color: var(--c-ink); background: var(--c-paper); border-color: var(--c-edge-hover);
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.06);
}
.f4-btn {
  border: 1px solid var(--c-edge); border-radius: 6px; padding: 4px 10px;
  font-size: 11.5px; font-weight: 600; color: var(--c-ink); background: var(--c-paper);
  line-height: 1.25;
}
.f4-btn[aria-pressed="true"] {
  border-color: #6A3093; color: #FFFFFF; background: #6A3093;
}
.f4-btn--ghost { color: var(--c-muted); background: var(--c-panel); }
.f4-btn--ghost:hover:not([disabled]) { color: var(--c-ink); }

.f4-scenario {
  display: grid; grid-template-columns: minmax(0, 1.35fr) repeat(3, minmax(0, 1fr)); gap: 8px;
  padding: 9px 11px; background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 5px;
  align-items: center;
}
.f4-slider-wrap { display: flex; flex-direction: column; gap: 4px; min-width: 0; padding-right: 6px; }
.f4-slider-head { display: flex; justify-content: space-between; align-items: baseline; gap: 6px; font-size: 11px; }
.f4-slider-lbl { font-weight: 600; color: var(--c-ink); }
.f4-slider-val { font-family: var(--f-mono); font-weight: 700; color: #B45309; font-variant-numeric: tabular-nums; }
.f4-range { width: 100%; accent-color: #6A3093; margin: 0; cursor: pointer; }
.f4-kpi {
  background: var(--c-paper); border: 1px solid var(--c-edge); border-radius: 4px;
  padding: 5px 8px; min-width: 0;
}
.f4-kpi-k { display: block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: var(--c-muted); }
.f4-kpi-v { display: block; font-family: var(--f-mono); font-size: 13.5px; font-weight: 700; color: var(--c-ink); font-variant-numeric: tabular-nums; }
.f4-kpi-v.is-purple { color: #6A3093; }
.f4-kpi-v.is-warn { color: #B45309; }

.f4-grid { display: grid; grid-template-columns: minmax(0, 0.96fr) minmax(0, 1.04fr); gap: 12px; align-items: stretch; }
.f4-panel {
  border: 1px solid var(--c-edge); border-radius: 5px; background: var(--c-paper);
  padding: 9px 11px; display: flex; flex-direction: column; gap: 8px; min-width: 0;
}
.f4-panel-head {
  display: flex; justify-content: space-between; align-items: baseline; gap: 8px;
  padding-bottom: 5px; border-bottom: 1px solid var(--c-edge);
}
.f4-panel-title { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--c-ink); }
.f4-panel-meta { font-family: var(--f-mono); font-size: 10px; color: var(--c-muted); }
.f4-svg { display: block; width: 100%; height: auto; }
.f4-zones { display: flex; flex-direction: column; gap: 5px; }
.f4-zone { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 2px 8px; align-items: center; font-size: 11.5px; }
.f4-zone-name { font-weight: 600; color: var(--c-ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.f4-zone-meta { font-family: var(--f-mono); font-size: 10.5px; font-variant-numeric: tabular-nums; color: #6A3093; font-weight: 700; }
.f4-zone-bar { grid-column: 1 / -1; height: 3.5px; border-radius: 2px; background: #E2E8F0; overflow: hidden; }
.f4-zone-fill { height: 100%; background: linear-gradient(90deg, #6A3093, #D55E00); border-radius: 2px; }

.f4-ai-head { margin: 0; font-family: var(--f-serif); font-size: 14px; font-weight: 700; color: var(--c-ink); line-height: 1.3; }
.f4-ai-body { margin: 0; font-size: 12.5px; line-height: 1.48; color: var(--c-ink); }
.f4-ai-drivers { display: flex; flex-direction: column; gap: 4px; }
.f4-driver {
  font-size: 11px; line-height: 1.35; padding: 4px 7px;
  border: 1px solid var(--c-edge); border-radius: 4px; background: var(--c-panel); color: var(--c-ink);
}
.f4-driver strong { color: #6A3093; font-family: var(--f-mono); font-size: 10.5px; }
.f4-ai-smoke { margin: 0; padding-top: 5px; border-top: 1px dashed var(--c-edge); font-size: 11.5px; line-height: 1.42; color: var(--c-muted); }
.f4-ai-smoke strong { color: var(--c-ink); }

.f4-ask-box {
  margin-top: auto; padding-top: 8px; border-top: 1px solid var(--c-edge);
  display: flex; flex-direction: column; gap: 6px;
}
.f4-prompts { display: flex; flex-wrap: wrap; gap: 4px; }
.f4-prompt-btn {
  padding: 2px 7px; border-radius: 4px; border: 1px solid var(--c-edge); background: var(--c-panel);
  font-family: var(--f-sans); font-size: 10.5px; font-weight: 500; color: var(--c-muted);
}
.f4-prompt-btn:hover { color: var(--c-ink); border-color: #6A3093; background: var(--c-paper); }
.f4-chat-log {
  max-height: 142px; overflow-y: auto; display: flex; flex-direction: column; gap: 6px;
  padding: 6px 8px; background: var(--c-panel); border: 1px solid var(--c-edge); border-radius: 5px;
}
.f4-chat-log[hidden] { display: none; }
.f4-msg { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; line-height: 1.44; }
.f4-msg + .f4-msg { padding-top: 6px; border-top: 1px dashed var(--c-edge); }
.f4-msg-q { font-family: var(--f-mono); font-size: 10.5px; font-weight: 600; color: #6A3093; }
.f4-msg-a { color: var(--c-ink); }
.f4-msg-meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px; font-family: var(--f-mono); font-size: 10px; color: var(--c-muted); }
.f4-apply-btn {
  padding: 2px 8px; border-radius: 4px; border: 1px solid #6A3093; background: #6A3093;
  color: #FFFFFF; font-family: var(--f-mono); font-size: 10px; font-weight: 600;
}
.f4-ask-form { display: flex; gap: 6px; align-items: stretch; }
.f4-ask-input {
  flex: 1 1 auto; min-width: 0; padding: 5px 9px; border: 1px solid var(--c-edge); border-radius: 5px;
  background: var(--c-paper); font-family: var(--f-sans); font-size: 12px; color: var(--c-ink);
}
.f4-ask-input:focus { outline: 2px solid #6A3093; outline-offset: -1px; border-color: #6A3093; }
.f4-ask-submit {
  flex: 0 0 auto; padding: 5px 12px; border-radius: 5px; border: 1px solid #6A3093;
  background: #6A3093; color: #FFFFFF; font-size: 11.5px; font-weight: 600;
}
.f4-ask-submit:hover:not([disabled]) { background: #58257A; border-color: #58257A; }
.f4-cap { font-size: 11.5px; font-style: italic; color: var(--c-muted); margin: 0; }

@media (max-width: 899px) {
  .f4-scenario { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .f4-slider-wrap { grid-column: 1 / -1; }
  .f4-grid { grid-template-columns: 1fr; }
}
`;

const NS = 'http://www.w3.org/2000/svg';

function renderTrajectorySvg(forecast, fmtCompactTick) {
  const pts = forecast.trajectory || [];
  if (!pts.length) return '';
  const W = 350;
  const H = 104;
  const ml = 36;
  const mr = 14;
  const mt = 10;
  const mb = 20;
  const maxVal = Math.max(...pts.map((p) => p.high || p.value || 1)) * 1.08;
  const minYr = pts[0].year;
  const maxYr = pts[pts.length - 1].year;
  const x = (yr) => ml + ((yr - minYr) / Math.max(1, maxYr - minYr)) * (W - ml - mr);
  const y = (v) => mt + (1 - v / maxVal) * (H - mt - mb);

  const hist = pts.filter((p) => p.kind === 'historical');
  const proj = pts.filter((p) => p.kind === 'projected');
  const bridge = hist.length && proj.length ? [hist[hist.length - 1], ...proj] : proj;

  const fanPts = bridge.length > 1
    ? [
        ...bridge.map((p) => `${x(p.year).toFixed(1)},${y(p.high).toFixed(1)}`),
        ...bridge.slice().reverse().map((p) => `${x(p.year).toFixed(1)},${y(p.low).toFixed(1)}`),
      ].join(' ')
    : '';

  const lineOf = (arr) => arr.map((p) => `${x(p.year).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const activePt = proj.find((p) => p.year === forecast.horizonYear) || proj[proj.length - 1];

  return `<svg class="f4-svg" viewBox="0 0 ${W} ${H}" xmlns="${NS}" role="img" aria-label="Historical to ${forecast.horizonYear} FRP projection">
    <line x1="${ml}" y1="${mt}" x2="${ml}" y2="${H - mb}" stroke="#D0D7DE"/>
    <line x1="${ml}" y1="${H - mb}" x2="${W - mr}" y2="${H - mb}" stroke="#D0D7DE"/>
    <line x1="${x(2025).toFixed(1)}" y1="${mt}" x2="${x(2025).toFixed(1)}" y2="${H - mb}" stroke="#94A3B8" stroke-dasharray="3 3"/>
    ${fanPts ? `<polygon points="${fanPts}" fill="rgba(106, 48, 147, 0.14)"/>` : ''}
    ${hist.length > 1 ? `<polyline fill="none" stroke="#1A1D21" stroke-width="1.6" points="${lineOf(hist)}"/>` : ''}
    ${bridge.length > 1 ? `<polyline fill="none" stroke="#6A3093" stroke-width="2" stroke-dasharray="4 2" points="${lineOf(bridge)}"/>` : ''}
    ${proj.map((p) => `<circle cx="${x(p.year).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="${p === activePt ? 4 : 2.6}" fill="${p === activePt ? '#6A3093' : '#FFFFFF'}" stroke="#6A3093" stroke-width="1.6"/>`).join('')}
    <text x="${ml - 4}" y="${mt + 4}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="#54595D">${fmtCompactTick(Math.round(maxVal))}</text>
    <text x="${ml - 4}" y="${H - mb}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="8.5" fill="#54595D">0</text>
    <text x="${x(minYr).toFixed(1)}" y="${H - 5}" text-anchor="start" font-family="IBM Plex Mono, monospace" font-size="9" fill="#54595D">${minYr}</text>
    <text x="${x(2025).toFixed(1)}" y="${H - 5}" text-anchor="middle" font-family="IBM Plex Mono, monospace" font-size="9" fill="#54595D">2025</text>
    <text x="${x(maxYr).toFixed(1)}" y="${H - 5}" text-anchor="end" font-family="IBM Plex Mono, monospace" font-size="9" font-weight="700" fill="#6A3093">${maxYr}</text>
  </svg>`;
}

export async function mount(el, ctx) {
  const { store, data, theme } = ctx;
  const { injectCss, escHtml, fmtCompact, fmtCompactTick, fmtMass } = theme;
  injectCss('f4', STYLE);

  el.innerHTML = '';
  const root = document.createElement('div');
  root.className = 'f4-root';

  root.innerHTML = `
    <div class="f4-head">
      <div class="f4-title-wrap">
        <h3 class="f4-title">Fig. 4 — Wildfire Horizon &amp; Interactive AI Analyst</h3>
        <span class="f4-sub" data-ref="sub">Theil-Sen statistical projection + Gemini conversational lab</span>
      </div>
      <div class="f4-controls">
        <div class="f4-seg" role="group" aria-label="Forecast horizon">
          ${HORIZONS.map((y) => `<button type="button" data-horizon="${y}" aria-pressed="false">${y}</button>`).join('')}
        </div>
        <button type="button" class="f4-btn" data-ref="overlayBtn" aria-pressed="false">Show Predicted Zones</button>
        <button type="button" class="f4-btn f4-btn--ghost" data-ref="aiBtn">Refresh AI Brief</button>
      </div>
    </div>
    <div class="f4-scenario">
      <label class="f4-slider-wrap">
        <span class="f4-slider-head">
          <span class="f4-slider-lbl">Dry-Season &amp; Warming Stress</span>
          <span class="f4-slider-val" data-ref="stressVal">+15%</span>
        </span>
        <input class="f4-range" type="range" min="0" max="40" step="5" value="15" data-ref="stressInput" aria-label="Dry-season warming stress scenario percentage">
      </label>
      <div class="f4-kpi">
        <span class="f4-kpi-k">Projected FRP</span>
        <span class="f4-kpi-v is-warn" data-ref="kpiFrp">—</span>
      </div>
      <div class="f4-kpi">
        <span class="f4-kpi-k">Est. CO₂ Pulse</span>
        <span class="f4-kpi-v" data-ref="kpiCo2">—</span>
      </div>
      <div class="f4-kpi">
        <span class="f4-kpi-k">Smoke Plume Risk</span>
        <span class="f4-kpi-v is-purple" data-ref="kpiRisk">—</span>
      </div>
    </div>
    <div class="f4-grid">
      <div class="f4-panel">
        <div class="f4-panel-head">
          <span class="f4-panel-title">Trajectory &amp; Priority Corridors</span>
          <span class="f4-panel-meta" data-ref="trajMeta">MW · uncertainty fan</span>
        </div>
        <div data-ref="trajChart"></div>
        <div class="f4-zones" data-ref="zones"></div>
      </div>
      <div class="f4-panel">
        <div class="f4-panel-head">
          <span class="f4-panel-title">Predictive Synthesis &amp; Field Q&amp;A</span>
          <span class="f4-panel-meta" data-ref="aiSource">Trend model</span>
        </div>
        <h4 class="f4-ai-head" data-ref="aiHeadline">—</h4>
        <p class="f4-ai-body" data-ref="aiBody"></p>
        <div class="f4-ai-drivers" data-ref="aiDrivers"></div>
        <p class="f4-ai-smoke" data-ref="aiSmoke"></p>
        <div class="f4-ask-box">
          <div class="f4-prompts" data-ref="prompts"></div>
          <div class="f4-chat-log" data-ref="chatLog" hidden></div>
          <form class="f4-ask-form" data-ref="askForm">
            <input class="f4-ask-input" type="text" data-ref="askInput" placeholder="Ask about a fire spike, smoke corridor, or +35% in 2035…" aria-label="Ask Wildfire Analyst">
            <button class="f4-ask-submit" type="submit" data-ref="askSubmit">Ask AI</button>
          </form>
        </div>
      </div>
    </div>
    <p class="f4-cap" data-ref="cap"></p>
  `;
  el.appendChild(root);

  const ref = (name) => root.querySelector(`[data-ref="${name}"]`);
  const horizonBtns = Array.from(root.querySelectorAll('[data-horizon]'));
  const overlayBtn = ref('overlayBtn');
  const aiBtn = ref('aiBtn');
  const stressInput = ref('stressInput');
  const promptsEl = ref('prompts');
  const chatLog = ref('chatLog');
  const askForm = ref('askForm');
  const askInput = ref('askInput');
  const askSubmit = ref('askSubmit');

  for (const btn of horizonBtns) {
    btn.addEventListener('click', () => store.set({ horizonYear: Number(btn.dataset.horizon) }));
  }
  overlayBtn.addEventListener('click', () => store.set({ showPredictedOverlay: !store.get().showPredictedOverlay }));
  stressInput.addEventListener('input', () => store.set({ warmingPct: Number(stressInput.value) }));

  let scope = null;
  let lastForecast = null;
  let scopeToken = 0;
  let aiToken = 0;
  let debounceTimer = null;
  const chatHistory = [];

  function renderBrief(brief, sourceLabel) {
    ref('aiSource').textContent = sourceLabel;
    ref('aiHeadline').textContent = brief.headline;
    ref('aiBody').textContent = brief.riskOutlook;
    const driversEl = ref('aiDrivers');
    driversEl.innerHTML = (brief.priorityZones || []).slice(0, 3).map((z) =>
      `<div class="f4-driver"><strong>${escHtml(z.region)} · ${escHtml(z.riskLevel)}</strong> — ${escHtml(z.driver)}</div>`,
    ).join('');
    ref('aiSmoke').innerHTML = `<strong>Air-quality link:</strong> ${escHtml(brief.smokeNote)}`;
  }

  function renderChatLog() {
    if (!chatHistory.length) {
      chatLog.hidden = true;
      chatLog.innerHTML = '';
      return;
    }
    chatLog.hidden = false;
    chatLog.innerHTML = '';
    for (const item of chatHistory.slice(-4)) {
      const box = document.createElement('div');
      box.className = 'f4-msg';
      const qEl = document.createElement('div');
      qEl.className = 'f4-msg-q';
      qEl.textContent = `Q: ${item.q}`;
      const aEl = document.createElement('div');
      aEl.className = 'f4-msg-a';
      aEl.textContent = item.a;
      const metaRow = document.createElement('div');
      metaRow.className = 'f4-msg-meta';
      const noteSpan = document.createElement('span');
      noteSpan.textContent = item.takeaway || (item.source === 'gemini-4-hydrogen' ? 'Gemini 4 AI' : 'Grounded Trend Model');
      metaRow.appendChild(noteSpan);
      if (item.suggestedScenario && (item.suggestedScenario.horizonYear || item.suggestedScenario.warmingPct !== undefined || item.suggestedScenario.showPredictedOverlay || item.suggestedScenario.focusYear)) {
        const sc = item.suggestedScenario;
        const applyBtn = document.createElement('button');
        applyBtn.type = 'button';
        applyBtn.className = 'f4-apply-btn';
        const parts = [];
        if (sc.focusYear) parts.push(`${sc.focusYear}`);
        if (sc.horizonYear) parts.push(`${sc.horizonYear}`);
        if (sc.warmingPct !== undefined) parts.push(`+${sc.warmingPct}%`);
        if (sc.showPredictedOverlay) parts.push('Map');
        applyBtn.textContent = `Apply (${parts.join(' · ')})`;
        applyBtn.addEventListener('click', () => {
          const patch = { playing: false };
          if (sc.horizonYear && HORIZONS.includes(Number(sc.horizonYear))) patch.horizonYear = Number(sc.horizonYear);
          if (sc.warmingPct !== undefined) patch.warmingPct = Number(sc.warmingPct);
          if (sc.showPredictedOverlay !== undefined) patch.showPredictedOverlay = Boolean(sc.showPredictedOverlay);
          if (sc.focusYear) patch.year = Number(sc.focusYear);
          store.set(patch);
        });
        metaRow.appendChild(applyBtn);
      }
      box.append(qEl, aEl, metaRow);
      chatLog.appendChild(box);
    }
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  function renderQuickPrompts(state, f) {
    const cName = f.countryName;
    const yr = Number(state.year);
    const lead = f.topZones[0]?.region || cName;
    const suggestions = [
      `Why did ${yr} burn hardest in ${lead}?`,
      `How does smoke PM₂.₅ compare to fire detections in ${yr}?`,
      `Test +35% extreme drought by 2035 on the map`,
    ];
    promptsEl.innerHTML = '';
    for (const q of suggestions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'f4-prompt-btn';
      b.textContent = q;
      b.addEventListener('click', () => submitQuestion(q));
      promptsEl.appendChild(b);
    }
    askInput.placeholder = `Ask about ${cName} ${yr}, ${lead}, or a warming scenario…`;
  }

  async function requestAiBrief(forecast, forceLive = false) {
    const my = ++aiToken;
    ref('aiSource').textContent = forceLive ? 'Contacting Gemini AI…' : 'Updating brief…';
    aiBtn.disabled = true;
    const scCtx = summarizeScopeContext(scope, store.get().year);
    try {
      const res = await fetch('/api/forecast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scopePath: forecast.scopePath,
          countryName: forecast.countryName,
          horizonYear: forecast.horizonYear,
          warmingPct: forecast.warmingPct,
          projectedFrpPct: forecast.projectedFrpPct,
          projectedCo2Pct: forecast.projectedCo2Pct,
          plumeRiskScore: forecast.plumeRiskScore,
          plumeTier: forecast.plumeTier,
          topZones: forecast.topZones,
          peakCo2Years: scCtx.peakCo2Years,
          forceRefresh: forceLive,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (my !== aiToken) return;
      const srcLabel = json.fallback ? 'Statistical trend brief' : 'Gemini 4 AI synthesis';
      if (json.brief) renderBrief(json.brief, srcLabel);
    } catch {
      if (my !== aiToken) return;
      renderBrief(buildDeterministicBrief(forecast), 'Statistical trend brief');
    } finally {
      if (my === aiToken) aiBtn.disabled = false;
    }
  }

  async function submitQuestion(rawQuestion) {
    const q = String(rawQuestion || '').trim();
    if (!q || !scope || !lastForecast) return;
    askInput.value = '';
    askSubmit.disabled = true;
    askSubmit.textContent = 'Thinking…';
    const state = store.get();
    const fullContext = {
      ...summarizeScopeContext(scope, state.year),
      horizonYear: lastForecast.horizonYear,
      warmingPct: lastForecast.warmingPct,
      projectedFrpPct: lastForecast.projectedFrpPct,
      projectedCo2Pct: lastForecast.projectedCo2Pct,
      plumeRiskScore: lastForecast.plumeRiskScore,
      topZones: lastForecast.topZones,
    };

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q,
          history: chatHistory.slice(-4).map((x) => ({ q: x.q, a: x.a })),
          context: fullContext,
        }),
      });
      const json = res.ok ? await res.json() : buildDeterministicAnswer(q, fullContext);
      chatHistory.push({
        q,
        a: json.answer,
        takeaway: json.takeaway,
        source: json.source,
        suggestedScenario: json.suggestedScenario || null,
      });
      renderChatLog();
    } catch {
      const fb = buildDeterministicAnswer(q, fullContext);
      chatHistory.push({ q, a: fb.answer, takeaway: fb.takeaway, source: 'statistical-model', suggestedScenario: fb.suggestedScenario });
      renderChatLog();
    } finally {
      askSubmit.disabled = false;
      askSubmit.textContent = 'Ask AI';
    }
  }

  askForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    submitQuestion(askInput.value);
  });

  function renderForecast(state, fetchAi = false) {
    if (!scope || !scope.meta) return null;
    const hYear = Number(state.horizonYear) || 2030;
    const wPct = Number(state.warmingPct) ?? 15;
    for (const b of horizonBtns) b.setAttribute('aria-pressed', String(Number(b.dataset.horizon) === hYear));
    overlayBtn.setAttribute('aria-pressed', String(!!state.showPredictedOverlay));
    overlayBtn.textContent = state.showPredictedOverlay ? 'Hide Predicted Zones' : 'Show Predicted Zones';
    stressInput.value = String(wPct);
    ref('stressVal').textContent = `+${wPct}%`;

    const f = computeForecast({ scope, horizonYear: hYear, warmingPct: wPct });
    lastForecast = f;
    ref('sub').textContent = `${f.countryName} · ${f.horizonYear} outlook (+${f.warmingPct}% dry-season stress) · Sen slope ${f.senSlopePerYr >= 0 ? '+' : ''}${fmtCompact(f.senSlopePerYr)} MW/yr`;
    ref('kpiFrp').textContent = `${fmtCompact(f.projectedFrpMw)} MW (+${f.projectedFrpPct}%)`;
    ref('kpiCo2').textContent = `${fmtMass(f.projectedCo2Tonnes, 'Mt')} (+${f.projectedCo2Pct}%)`;
    ref('kpiRisk').textContent = `${f.plumeRiskScore}/100 · ${f.plumeTier}`;
    ref('trajMeta').textContent = `2018–${f.horizonYear} · +${f.projectedFrpPct}% vs med`;
    ref('trajChart').innerHTML = renderTrajectorySvg(f, fmtCompactTick);

    const maxDelta = Math.max(1, ...f.topZones.map((z) => z.deltaPct));
    ref('zones').innerHTML = f.topZones.slice(0, 4).map((z) => {
      const w = Math.max(12, Math.round((z.deltaPct / maxDelta) * 100));
      return `<div class="f4-zone">
        <span class="f4-zone-name">${escHtml(z.region)}</span>
        <span class="f4-zone-meta">+${z.deltaPct}% · ${z.tier}</span>
        <div class="f4-zone-bar"><div class="f4-zone-fill" style="width:${w}%"></div></div>
      </div>`;
    }).join('');

    ref('cap').textContent = `Fig. 4 — Deterministic Theil-Sen drift combined with +${wPct}% vapor-pressure stress through ${hYear}; toggle "Show Predicted Zones" or ask the AI analyst above.`;
    renderQuickPrompts(state, f);

    renderBrief(buildDeterministicBrief(f), 'Statistical trend brief');
    if (fetchAi) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => requestAiBrief(f, false), 220);
    }
    return f;
  }

  aiBtn.addEventListener('click', () => {
    const f = renderForecast(store.get(), false);
    if (f) requestAiBrief(f, true);
  });

  async function build(state) {
    const my = ++scopeToken;
    const sc = await data.getScope(state);
    if (my !== scopeToken) return;
    scope = sc;
    if (!scope || !scope.meta) {
      theme.placeholder(el);
      return;
    }
    renderForecast(state, true);
  }

  store.subscribe((state, prev) => {
    if (state.countryId !== prev.countryId) {
      chatHistory.length = 0;
      renderChatLog();
      build(state);
    } else if (
      state.horizonYear !== prev.horizonYear
      || state.warmingPct !== prev.warmingPct
      || state.showPredictedOverlay !== prev.showPredictedOverlay
    ) {
      renderForecast(state, state.horizonYear !== prev.horizonYear || state.warmingPct !== prev.warmingPct);
    } else if (state.year !== prev.year && lastForecast) {
      renderQuickPrompts(state, lastForecast);
    }
  });

  await build(store.get());
}
