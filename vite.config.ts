import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';

// Ensures %VITE_SITE_URL% in index.html always resolves (on Vercel defaults to the production host; override via env).
process.env.VITE_SITE_URL ||= process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : 'https://ringcraft.vercel.app';

// Single source of truth for security headers: vercel.json. Applied to `vite preview` so
// local preview and e2e enforce the same CSP as production (not applied to the dev server: HMR needs inline/eval).
const vercelConfig = JSON.parse(readFileSync(path.resolve(import.meta.dirname, 'vercel.json'), 'utf8')) as {
  headers: { source: string; headers: { key: string; value: string }[] }[];
};
const previewHeaders = Object.fromEntries(
  vercelConfig.headers.filter((h) => h.source === '/(.*)').flatMap((h) => h.headers.map((x) => [x.key, x.value]))
);

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    define: { __VERCEL__: JSON.stringify(!!process.env.VERCEL) },
    preview: { headers: previewHeaders },
    build: {
      chunkSizeWarningLimit: 750,
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            if (id.includes('node_modules/three/')) return 'three-vendor';
            if (id.includes('node_modules/react') || id.includes('node_modules/scheduler')) return 'react-vendor';
            return undefined;
          },
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
  };
});
