// js/ui/tour.js
// Purpose: integrated onboarding tour matching Variant-R's editorial cards and country borders,
//          plus manual replay via the header "Take tour" button.

const STORAGE_KEY = 'variant_r_tour_v1';

const STYLE = `
.etr-wrap {
  position: fixed;
  inset: 0;
  z-index: 9000;
  pointer-events: auto;
}
.etr-wrap[hidden] { display: none; }
.etr-spot {
  position: fixed;
  border-radius: var(--radius-win, 10px);
  border: 2px solid var(--c-win-border-hover, var(--c-fire));
  box-shadow: 0 0 0 9999px rgba(28, 25, 23, 0.42), 0 0 0 5px rgba(213, 94, 0, 0.14);
  pointer-events: none;
  transition: top 240ms var(--ease-out), left 240ms var(--ease-out), width 240ms var(--ease-out), height 240ms var(--ease-out);
}
.etr-card {
  position: fixed;
  width: min(356px, calc(100vw - 24px));
  background: var(--c-paper);
  color: var(--c-ink);
  border: 2.5px solid var(--c-win-border, var(--c-edge-hover));
  border-radius: var(--radius-win, 10px);
  padding: 15px 17px 14px;
  box-shadow: var(--shadow-card-hover, 0 12px 32px rgba(28, 25, 23, 0.16));
  display: flex;
  flex-direction: column;
  gap: 9px;
  transition: top 240ms var(--ease-out), left 240ms var(--ease-out), opacity 180ms var(--ease-out);
  z-index: 9001;
}
.etr-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.etr-kicker {
  font-family: var(--f-mono);
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--c-fire);
  background: rgba(213, 94, 0, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
}
.etr-close {
  border: 1px solid transparent;
  background: transparent;
  color: var(--c-muted);
  font-size: 17px;
  line-height: 1;
  padding: 2px 7px;
  border-radius: 5px;
}
.etr-close:hover { background: var(--c-panel); border-color: var(--c-edge); color: var(--c-ink); }
.etr-title {
  margin: 0;
  font-family: var(--f-serif);
  font-size: 17.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  color: var(--c-ink);
}
.etr-body {
  margin: 0;
  font-size: 13px;
  line-height: 1.54;
  color: var(--c-muted);
}
.etr-dots {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 2px;
}
.etr-dot {
  width: 6px;
  height: 6px;
  border-radius: 99px;
  background: var(--c-edge);
  transition: width 180ms var(--ease-out), background-color 180ms var(--ease-out);
}
.etr-dot.is-active {
  width: 18px;
  background: var(--c-fire);
}
.etr-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 2px;
  padding-top: 10px;
  border-top: 1px solid var(--c-edge);
}
.etr-skip {
  border: 0;
  background: transparent;
  padding: 4px 2px;
  font-size: 12px;
  font-weight: 500;
  color: var(--c-muted);
}
.etr-skip:hover { color: var(--c-ink); text-decoration: underline; background: transparent; }
.etr-nav { display: flex; align-items: center; gap: 6px; }
.etr-btn {
  padding: 5px 12px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 6px;
  border: 1px solid var(--c-edge);
  background: var(--c-panel);
  color: var(--c-ink);
}
.etr-btn:hover:not([disabled]) { background: var(--c-paper); border-color: var(--c-edge-hover); }
.etr-btn.is-primary {
  background: var(--c-ink);
  border-color: var(--c-ink);
  color: #FFFFFF;
}
.etr-btn.is-primary:hover { background: #334155; }
`;

const STEPS = [
  {
    selector: '#region-tabs',
    kicker: 'Step 1 of 8 · Country',
    title: 'Pick Canada, USA, or Russia',
    body: 'Switch between 25 years (2002–2026) of satellite fire detections and smoke records across all three countries.',
  },
  {
    selector: '#year-slider',
    kicker: 'Step 2 of 8 · Timeline',
    title: 'Slide & Replay 2002–2026',
    body: 'Drag across any year or press Play to watch fires change over time. Orange triangles mark the biggest fire years.',
  },
  {
    selector: '#map',
    kicker: 'Step 3 of 8 · Live Map',
    title: 'Fires, Smoke Plumes & Pin Drops',
    body: 'Zoom into fire clusters, switch smoke plumes on in the top right, or drop a pin on the map to check any town.',
  },
  {
    selector: '#local-risk',
    kicker: 'Step 4 of 8 · How Local Risk Works',
    title: 'How Your Local Risk Score Works',
    body: 'When you pick a city or drop a pin, Variant-R scans 25 years of satellite grids inside 100 km. Fires within 25 km weigh much more than far-off forest blazes, and smoky-air odds are scored separately from direct flame threat so your score stays realistic and your tips match your spot.',
  },
  {
    selector: '#fig2',
    kicker: 'Step 5 of 8 · Year Contrast',
    title: 'Before vs. During Big Fire Years',
    body: 'Compare fire activity right before a major wildfire season against the spike itself.',
  },
  {
    selector: '#forests-panel',
    kicker: 'Step 6 of 8 · Forests & Satellites',
    title: 'Active Forests & Sensors',
    body: 'Search every burning forest area, check daytime vs. nighttime satellite passes, and view VIIRS outage days in this open panel.',
  },
  {
    selector: '#fig3',
    kicker: 'Step 7 of 8 · Smoke Chemistry',
    title: 'Smoke & Pollution Breakdown',
    body: 'Compare eight smoke gases against a typical year, explore the hardest-hit forests, and read each year’s summary.',
  },
  {
    selector: '#outlook',
    kicker: 'Step 8 of 8 · Outlook & AI Search',
    title: 'Future Forecast & Variant-R AI',
    body: 'Test 2027–2035 warming scenarios, check the formulas in Methodology & Data Used, or use Variant-R AI Data Search to query all 25 years across all three countries.',
  },
];

let activeController = null;

function markTourSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // ignore storage errors in hardened iframes
  }
}

function hasSeenTour() {
  try {
    return Boolean(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

export function startTour(theme) {
  if (activeController) {
    activeController.open(0);
    return;
  }
  if (theme && typeof theme.injectCss === 'function') {
    theme.injectCss('etr', STYLE);
  }
  markTourSeen();

  const wrap = document.createElement('div');
  wrap.className = 'etr-wrap';
  wrap.setAttribute('role', 'dialog');
  wrap.setAttribute('aria-modal', 'true');
  wrap.setAttribute('aria-label', 'Variant-R guided tour');

  const spot = document.createElement('div');
  spot.className = 'etr-spot';

  const card = document.createElement('div');
  card.className = 'etr-card';
  card.innerHTML = `
    <div class="etr-top">
      <span class="etr-kicker" data-ref="kicker"></span>
      <button type="button" class="etr-close" data-ref="close" aria-label="Close tour">×</button>
    </div>
    <h3 class="etr-title" data-ref="title"></h3>
    <p class="etr-body" data-ref="body"></p>
    <div class="etr-dots" data-ref="dots" aria-hidden="true"></div>
    <div class="etr-foot">
      <button type="button" class="etr-skip" data-ref="skip">Skip tour</button>
      <div class="etr-nav">
        <button type="button" class="etr-btn" data-ref="prev">Back</button>
        <button type="button" class="etr-btn is-primary" data-ref="next">Next</button>
      </div>
    </div>
  `;

  wrap.append(spot, card);
  document.body.appendChild(wrap);

  const q = (r) => card.querySelector(`[data-ref="${r}"]`);
  const kickerEl = q('kicker');
  const titleEl = q('title');
  const bodyEl = q('body');
  const dotsEl = q('dots');
  const closeBtn = q('close');
  const skipBtn = q('skip');
  const prevBtn = q('prev');
  const nextBtn = q('next');

  let index = 0;

  function positionStep() {
    if (wrap.hidden) return;
    const step = STEPS[index];
    const target = document.querySelector(step.selector);
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 7;

    let rect = null;
    if (target) {
      const r = target.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) rect = r;
    }

    if (rect) {
      const sLeft = Math.max(4, rect.left - pad);
      const sTop = Math.max(4, rect.top - pad);
      const sWidth = Math.min(vw - sLeft - 4, rect.width + pad * 2);
      const sHeight = Math.min(vh - sTop - 4, rect.height + pad * 2);
      spot.style.display = 'block';
      spot.style.left = `${Math.round(sLeft)}px`;
      spot.style.top = `${Math.round(sTop)}px`;
      spot.style.width = `${Math.round(Math.max(24, sWidth))}px`;
      spot.style.height = `${Math.round(Math.max(24, sHeight))}px`;

      const cardRect = card.getBoundingClientRect();
      const cW = cardRect.width || Math.min(356, vw - 24);
      const cH = cardRect.height || 220;
      const gap = 14;

      let left = sLeft + sWidth / 2 - cW / 2;
      left = Math.max(12, Math.min(vw - cW - 12, left));

      let top;
      const spaceBelow = vh - (sTop + sHeight);
      const spaceAbove = sTop;
      const spaceRight = vw - (sLeft + sWidth);
      const spaceLeft = sLeft;

      if (spaceBelow >= cH + gap + 8) {
        top = sTop + sHeight + gap;
      } else if (spaceAbove >= cH + gap + 8) {
        top = sTop - cH - gap;
      } else if (spaceRight >= cW + gap + 8) {
        left = sLeft + sWidth + gap;
        top = Math.max(12, Math.min(vh - cH - 12, sTop + 12));
      } else if (spaceLeft >= cW + gap + 8) {
        left = sLeft - cW - gap;
        top = Math.max(12, Math.min(vh - cH - 12, sTop + 12));
      } else {
        top = Math.max(12, vh - cH - 14);
      }

      top = Math.max(12, Math.min(vh - cH - 12, top));
      card.style.left = `${Math.round(left)}px`;
      card.style.top = `${Math.round(top)}px`;
    } else {
      spot.style.display = 'none';
      const cardRect = card.getBoundingClientRect();
      const cW = cardRect.width || 340;
      const cH = cardRect.height || 200;
      card.style.left = `${Math.round((vw - cW) / 2)}px`;
      card.style.top = `${Math.round((vh - cH) / 2)}px`;
    }
  }

  function renderStep(i) {
    index = Math.max(0, Math.min(STEPS.length - 1, i));
    const step = STEPS[index];
    kickerEl.textContent = step.kicker;
    titleEl.textContent = step.title;
    bodyEl.textContent = step.body;
    dotsEl.innerHTML = STEPS.map((_, di) => `<span class="etr-dot${di === index ? ' is-active' : ''}"></span>`).join('');
    prevBtn.disabled = index === 0;
    nextBtn.textContent = index === STEPS.length - 1 ? 'Start exploring' : 'Next';

    const target = document.querySelector(step.selector);
    if (target) {
      const r = target.getBoundingClientRect();
      const needsScroll = r.top < 20 || r.bottom > window.innerHeight - 20;
      if (needsScroll) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(positionStep, 280);
      }
    }
    requestAnimationFrame(positionStep);
  }

  function close() {
    markTourSeen();
    wrap.hidden = true;
  }

  function open(startAt = 0) {
    markTourSeen();
    wrap.hidden = false;
    renderStep(startAt);
    nextBtn.focus({ preventScroll: true });
  }

  closeBtn.addEventListener('click', close);
  skipBtn.addEventListener('click', close);
  prevBtn.addEventListener('click', () => { if (index > 0) renderStep(index - 1); });
  nextBtn.addEventListener('click', () => {
    if (index < STEPS.length - 1) renderStep(index + 1);
    else close();
  });
  wrap.addEventListener('click', (ev) => {
    if (ev.target === wrap) close();
  });

  window.addEventListener('resize', positionStep, { passive: true });
  window.addEventListener('scroll', positionStep, { passive: true });
  window.addEventListener('keydown', (ev) => {
    if (wrap.hidden) return;
    if (ev.key === 'Escape') close();
    else if (ev.key === 'ArrowRight') {
      if (index < STEPS.length - 1) renderStep(index + 1);
    } else if (ev.key === 'ArrowLeft') {
      if (index > 0) renderStep(index - 1);
    }
  });

  activeController = { open, close };
  open(0);
}

export function mountTour(ctx) {
  const { theme } = ctx;
  if (hasSeenTour()) return;
  setTimeout(() => {
    if (!hasSeenTour()) startTour(theme);
  }, 650);
}
