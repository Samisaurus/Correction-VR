import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

const SCOPE_PATTERNS = [
  { scope: 'canada/fraser', match: ['canada/fraser', 'fraser'] },
  { scope: 'usa/yukon', match: ['usa/yukon', 'yukon'] },
  { scope: 'russia/amur', match: ['russia/amur', 'amur'] },
  { scope: 'canada', match: ['canada', 'can_'] },
  { scope: 'usa', match: ['usa', 'united_states', 'u.s.'] },
  { scope: 'russia', match: ['russia', 'rus_'] },
];

function csvHasDataRows(filePath) {
  let fd;
  try {
    const stat = fs.statSync(filePath);
    if (stat.size === 0) return false;
    fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(Math.min(stat.size, 1024));
    const n = fs.readSync(fd, buf, 0, buf.length, 0);
    const lines = buf.subarray(0, n).toString('utf8').split(/\r?\n/).filter((l) => l.trim());
    return lines.length >= 2;
  } catch {
    return false;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

function detectScope(relPath, fileName) {
  const norm = relPath.replace(/\\/g, '/').toLowerCase();
  const base = fileName.toLowerCase();
  for (const entry of SCOPE_PATTERNS) {
    if (norm.startsWith(`${entry.scope}/`)) return entry.scope;
  }
  for (const entry of SCOPE_PATTERNS) {
    if (entry.match.some((m) => norm.includes(m) || base.includes(m))) return entry.scope;
  }
  return null;
}

export function buildDataManifest(dataRoot = path.resolve('data')) {
  const scopes = {};
  const ensure = (s) => {
    if (!scopes[s]) scopes[s] = { fires: [], air: null, series: null };
    return scopes[s];
  };

  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full);
        continue;
      }
      if (!ent.isFile() || !ent.name.toLowerCase().endsWith('.csv')) continue;
      if (!csvHasDataRows(full)) continue;

      const rel = path.relative(dataRoot, full).replace(/\\/g, '/');
      const scope = detectScope(rel, ent.name);
      if (!scope) continue;

      const lower = ent.name.toLowerCase();
      const url = `./data/${rel}`;
      const bucket = ensure(scope);

      if (lower === 'series.csv' || lower.includes('series')) {
        bucket.series = url;
      } else if (lower === 'air.csv' || /(?:^|\/)air(?:\/|_)/.test(rel.toLowerCase())) {
        bucket.air = url;
      } else {
        const yearMatch = ent.name.match(/(?:^|[_-])((?:19|20)\d{2})(?:[_.-]|$)/);
        const year = yearMatch ? Number(yearMatch[1]) : null;
        const sensor = lower.includes('viirs') ? 'viirs' : lower.includes('modis') ? 'modis' : 'other';
        bucket.fires.push({ url, year, sensor, file: ent.name });
      }
    }
  }

  walk(dataRoot);
  return { generatedAt: new Date().toISOString(), scopes };
}

function dataPipelinePlugin() {
  return {
    name: 'data-manifest-and-copy',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const cleanUrl = (req.url || '').split('?')[0];
        if (cleanUrl === '/data/manifest.json') {
          const manifest = buildDataManifest(path.resolve('data'));
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(manifest));
          return;
        }
        next();
      });
    },
    closeBundle() {
      const src = path.resolve('data');
      const dest = path.resolve('dist/data');
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
        fs.writeFileSync(path.join(dest, 'manifest.json'), JSON.stringify(buildDataManifest(src)));
      }
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    rollupOptions: {
      external: [/^https?:\/\//],
    },
  },
  plugins: [dataPipelinePlugin()],
});
