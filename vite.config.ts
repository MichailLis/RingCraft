import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import path from 'path';
import { defineConfig } from 'vite';

// Pin the canonical origin so preview deployments and aliases agree with production.
const siteOrigin = new URL(process.env.VITE_SITE_URL || 'https://ringcraft-audio.vercel.app').origin;
process.env.VITE_SITE_URL = siteOrigin;

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
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'search-index-files',
        apply: 'build',
        generateBundle() {
          this.emitFile({
            type: 'asset',
            fileName: 'robots.txt',
            source: `User-agent: *\nAllow: /\n\nSitemap: ${siteOrigin}/sitemap.xml\n`,
          });
          this.emitFile({
            type: 'asset',
            fileName: 'sitemap.xml',
            source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${siteOrigin}/</loc></url></urlset>\n`,
          });
        },
      },
    ],
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
