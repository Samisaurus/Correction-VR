// server.ts — Express HTTP server for Ember Observatory (port 3000)
// Serves Vite middleware in dev, dist/ in production, and POST /api/forecast powered by Gemini AI.

import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { buildDeterministicBrief } from './js/forecast.js';

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const CACHE_TTL_MS = 10 * 60 * 1000;
const aiCache = new Map<string, { ts: number; data: unknown }>();

const FORECAST_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    headline: { type: Type.STRING, description: 'Concise 8-12 word scientific headline naming region and year' },
    riskOutlook: { type: Type.STRING, description: '2 concise factual sentences synthesizing trend and warming stress' },
    priorityZones: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          region: { type: Type.STRING },
          riskLevel: { type: Type.STRING, description: 'One of: Extreme, High, Elevated' },
          driver: { type: Type.STRING, description: 'Short 5-8 word ecological fire driver' },
        },
        required: ['region', 'riskLevel', 'driver'],
      },
    },
    smokeNote: { type: Type.STRING, description: 'One factual sentence on downwind PM2.5 smoke haze, black-carbon transport, and regional air quality stress' },
  },
  required: ['headline', 'riskOutlook', 'priorityZones', 'smokeNote'],
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
  app.use(express.json({ limit: '64kb' }));

  app.post('/api/forecast', async (req, res) => {
    const body = req.body || {};
    const scopePath = String(body.scopePath || 'usa');
    const horizonYear = Number(body.horizonYear) || 2030;
    const warmingPct = Number(body.warmingPct) || 15;
    const cacheKey = `${scopePath}|${horizonYear}|${Math.round(warmingPct / 5) * 5}`;

    const cached = aiCache.get(cacheKey);
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

    const prompt = [
      'You are an Earth-science wildfire and atmospheric smoke analyst.',
      `Provide a concise, strictly grounded forecast brief for ${body.countryName || scopePath}.`,
      `Scenario parameters: Horizon Year=${horizonYear}, Dry-Season Warming Stress=+${warmingPct}%.`,
      `Statistical trend metrics: Projected Fire Radiative Power change=+${body.projectedFrpPct}% vs historical median; Projected CAMS GFAS CO2 change=+${body.projectedCo2Pct}%; Smoke Plume Risk=${body.plumeRiskScore}/100 (${body.plumeTier}).`,
      `Top emerging fire corridors: ${zonesText}.`,
      'Ground every claim in these numbers without inventing external figures. Focus strictly on wildfire energy and atmospheric smoke emissions.',
    ].join('\n');

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
    app.get('*', (_req, res) => {
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
