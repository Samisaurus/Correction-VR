import fs from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';

function copyDataDir() {
  return {
    name: 'copy-data-dir',
    closeBundle() {
      const src = path.resolve('data');
      const dest = path.resolve('dist/data');
      if (fs.existsSync(src)) {
        fs.cpSync(src, dest, { recursive: true });
      }
    },
  };
}

export default defineConfig({
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
  plugins: [copyDataDir()],
});
