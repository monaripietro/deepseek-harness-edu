import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

const CROSS_ORIGIN_ISOLATION = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

// `base` is configurable so the same build can run on a custom domain (/) or a Pages subpath.
export default defineConfig({
  base: process.env.HARNESS_LAB_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Harness Lab — Dal modello all’agente',
        short_name: 'Harness Lab',
        description: 'Costruisci strato dopo strato l’harness che trasforma un piccolo modello linguistico in un agente.',
        lang: 'it',
        theme_color: '#0b0d1a',
        background_color: '#0b0d1a',
        display: 'standalone',
        icons: [{ src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
      },
      workbox: {
        // App shell only. Model weights live in the Transformers.js Cache API and are never precached;
        // the 26 MB ONNX Runtime WASM (fallback only) is fetched on demand.
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/model.worker-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
      },
    }),
  ],
  // Cross-origin isolation lets ONNX Runtime WASM use several CPU cores (SharedArrayBuffer).
  // Hugging Face and jsDelivr answer with CORS / CORP headers, so model downloads keep working.
  server: { headers: CROSS_ORIGIN_ISOLATION },
  preview: { headers: CROSS_ORIGIN_ISOLATION },
  worker: { format: 'es' },
  optimizeDeps: { exclude: ['@huggingface/transformers'] },
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 1500 },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'tests/**/*.test.ts'],
  },
})
