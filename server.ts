// server.ts — Express HTTP server for Ember Observatory (port 3000)
// Serves Vite middleware in dev, dist/ in production, and POST /api/forecast powered by Gemini AI.

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildDeterministicAnswer, buildDeterministicBrief } from './js/forecast.js';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const CACHE_TTL_MS = 10 * 60 * 1000;
const aiCache = new Map<string, { ts: number; data: unknown }>();

const FORECAST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: 'Vivid, concise 8-12 word analytical headline naming region and year' },
    riskOutlook: { type: Type.STRING, description: '2 clear, engaging scientific sentences comparing historical benchmark years to scenario stress' },
    priorityZones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          region: { type: Type.STRING },
          riskLevel: { type: Type.STRING, description: 'One of: Extreme, High, Elevated' },
          driver: { type: Type.STRING, description: 'Specific 5-9 word biophysical wildfire driver' },
        },
        required: ['region', 'riskLevel', 'driver'],
      },
    },
    smokeNote: { type: Type.STRING, description: 'One incisive sentence on downwind PM2.5 smoke haze, black-carbon transport, and airshed risk' },
  },
  required: ['headline', 'riskOutlook', 'priorityZones', 'smokeNote'],
};

const ASK_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    answer: { type: Type.STRING, description: '2-4 crisp, natural, authoritative sentences answering the user using the supplied metrics and historical context. Plain prose without markdown bullets.' },
    takeaway: { type: Type.STRING, description: 'Short 6-10 word bottom-line insight' },
    suggestedScenario: {
      type: Type.OBJECT,
      nullable: true,
      description: 'Populate ONLY if the user asks to test a scenario, change horizon/warming stress, jump to a peak year, or view predicted hotspots on the map.',
      properties: {
        horizonYear: { type: Type.INTEGER, description: 'One of 2027, 2030, or 2035 if relevant' },
        warmingPct: { type: Type.INTEGER, description: 'Multiple of 5 from 0 to 40 if relevant' },
        showPredictedOverlay: { type: Type.BOOLEAN, description: 'Set true if user asks to show/overlay predicted hotspots on map' },
        focusYear: { type: Type.INTEGER, description: 'Year 2002-2026 if recommending inspecting a specific historical year' },
      },
    },
  },
  required: ['answer', 'takeaway'],
};

function getClient() {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
  });
}

async function createApp() {
  const app = express();
  app.use(express.json({ limit: '96kb' }));

  app.post('/api/forecast', async (req, res) => {
    const body = req.body || {};
    const scopePath = String(body.scopePath || 'usa');
    const horizonYear = Number(body.horizonYear) || 2030;
    const warmingPct = Number(body.warmingPct) || 15;
    const forceRefresh = Boolean(body.forceRefresh);
    const cacheKey = `${scopePath}|${horizonYear}|${Math.round(warmingPct / 5) * 5}`;

    const cached = !forceRefresh ? aiCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    const fallbackBrief = buildDeterministicBrief({
      scopePath,
      countryName: String(body.countryName || scopePath.toUpperCase()),
      horizonYear,
      warmingPct,
      projectedFrpPct: Number(body.projectedFrpPct) || 0,
      projectedCo2Pct: Number(body.projectedCo2Pct) || 0,
      plumeRiskScore: Number(body.plumeRiskScore) || 50,
      plumeTier: String(body.plumeTier || 'Elevated'),
      topZones: Array.isArray(body.topZones) ? body.topZones : [],
    });

    const ai = getClient();
    if (!ai) {
      return res.json({ source: 'statistical-model', fallback: true, brief: fallbackBrief });
    }

    const zonesText = Array.isArray(body.topZones)
      ? body.topZones.slice(0, 4).map((z: { region?: string; deltaPct?: number; tier?: string }) =>
          `${z.region} (+${z.deltaPct}% risk, tier: ${z.tier})`).join('; ')
      : scopePath;

    const peaks = Array.isArray(body.peakCo2Years)
      ? body.peakCo2Years.map((p: { year?: number; co2Mt?: number; topRegion?: string }) =>
          `${p.year}: ${p.co2Mt} Mt CO2 (${p.topRegion})`).join('; ')
      : '';

    const prompt = [
      'You are a field-seasoned Earth-science wildfire and atmospheric chemistry analyst writing an editorial intelligence brief—direct, vivid, never robotic or repetitive.',
      `Region: ${body.countryName || scopePath}. Scenario: Horizon=${horizonYear}, Dry-Season Stress=+${warmingPct}%.`,
      `Statistical trend metrics: Projected FRP change=+${body.projectedFrpPct}% vs historical median; Projected CAMS GFAS CO2 change=+${body.projectedCo2Pct}%; Smoke Plume Risk=${body.plumeRiskScore}/100 (${body.plumeTier}).`,
      peaks ? `Historical peak carbon years in archive: ${peaks}.` : '',
      `Top emerging fire corridors: ${zonesText}.`,
      'Ground every quantitative claim strictly in these figures without inventing outside statistics. Highlight ecological mechanics (fuel curing, peat/duff smoldering, lightning blowups, smoke transport).',
    ].filter(Boolean).join('\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: FORECAST_SCHEMA,
        },
      });
      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini API');
      const brief = JSON.parse(text);
      const result = { source: 'gemini-4-hydrogen', fallback: false, brief };
      if (aiCache.size >= 64) {
        const oldest = aiCache.keys().next().value;
        if (oldest) aiCache.delete(oldest);
      }
      aiCache.set(cacheKey, { ts: Date.now(), data: result });
      return res.json(result);
    } catch (err) {
      console.warn('POST /api/forecast Gemini fallback:', err instanceof Error ? err.message : err);
      return res.json({ source: 'statistical-model', fallback: true, brief: fallbackBrief });
    }
  });

  app.post('/api/ask', async (req, res) => {
    const body = req.body || {};
    const question = String(body.question || '').trim().slice(0, 600);
    if (!question) {
      return res.status(400).json({ error: 'Missing question' });
    }
    const context = (body.context && typeof body.context === 'object') ? body.context : {};
    const history = Array.isArray(body.history) ? body.history.slice(-4) : [];

    const fallback = buildDeterministicAnswer(question, context);
    const ai = getClient();
    if (!ai) {
      return res.json({ source: 'statistical-model', fallback: true, ...fallback });
    }

    const histText = history.length
      ? history.map((h: { q?: string; a?: string }) => `User: ${h.q}\nAnalyst: ${h.a}`).join('\n')
      : 'None';

    const prompt = [
      'You are the conversational Earth-science wildfire analyst inside Ember Observatory (covering USA, Canada, and Russia from 2002 to 2026 via full NASA MODIS/VIIRS spatial grids + Copernicus CAMS GFAS emissions, plus 2027-2035 projections and a 100 km local risk estimator).',
      'Be articulate, approachable, insightful, and grounded strictly in the provided archive telemetry—never invent numbers outside this context, and give calm, practical everyday advice if asked about community safety.',
      `Active dashboard state JSON:\n${JSON.stringify(context)}`,
      `Recent conversation:\n${histText}`,
      `User question: ${question}`,
    ].join('\n\n');

    try {
      const response = await ai.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseSchema: ASK_SCHEMA,
        },
      });
      const text = response.text;
      if (!text) throw new Error('Empty response from Gemini API');
      const parsed = JSON.parse(text);
      return res.json({
        source: 'gemini-4-hydrogen',
        fallback: false,
        answer: parsed.answer || fallback.answer,
        takeaway: parsed.takeaway || fallback.takeaway,
        suggestedScenario: parsed.suggestedScenario || null,
      });
    } catch (err) {
      console.warn('POST /api/ask Gemini fallback:', err instanceof Error ? err.message : err);
      return res.json({ source: 'statistical-model', fallback: true, ...fallback });
    }
  });

  if (!IS_PROD) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve('dist');
    app.use(express.static(distDir));
    app.get('/{*splat}', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Ember Observatory server listening on http://0.0.0.0:${PORT}`);
  });
}

createApp().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
