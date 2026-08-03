import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A manifest already exists at public/favicon/site.webmanifest and is
      // linked from index.html — this plugin is only here for the service
      // worker (offline caching), not to generate/replace that manifest.
      manifest: false,
      registerType: 'autoUpdate',
      workbox: {
        // Precache the app shell (JS/CSS/HTML/fonts) so the app itself loads
        // offline. The pdf.js worker and OCR assets are deliberately left out
        // of the precache — they're tens of MB combined and most visitors
        // never touch OCR — and instead runtime-cached below: the first
        // online use of PDF/image redaction caches them, and every use after
        // that (online or offline) is served from cache.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
        // These are matched by the .js glob above but are multi-MB OCR
        // assets meant to be runtime-cached (see runtimeCaching), not
        // force-downloaded as part of the app shell precache.
        globIgnores: ['tesseract/**', 'tessdata/**'],
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            // pdf.js's worker script — needed for every PDF redaction.
            urlPattern: /\/assets\/pdf\.worker/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'pdf-worker',
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Tesseract.js worker + WASM OCR core.
            urlPattern: /\/tesseract\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tesseract-core',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Per-language OCR trained-data packs, fetched lazily per language.
            urlPattern: /\/tessdata\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'tessdata',
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
})
