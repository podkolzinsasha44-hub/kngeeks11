import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// `base: './'` lets the same build run from any folder (GitHub Pages, Firebase, a local server).
export default defineConfig({
  base: './',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Football GM — футбольный менеджер',
        short_name: 'Football GM',
        description: 'Реальные клубы и игроки РПЛ и топ-лиг Европы: трансферы, расстановка, честный матчевый движок',
        lang: 'ru',
        start_url: './',
        scope: './',
        display: 'standalone',
        // Phones are played in portrait; tablets and PCs in any orientation (from 1024 px the PC layout).
        orientation: 'any',
        background_color: '#05070d',
        theme_color: '#05070d',
        icons: [{ src: 'icons/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2,json}'],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
        // Player photos: once seen, they stay available offline.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/img\.a\.transfermarkt\.technology\/portrait\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'player-photos',
              expiration: { maxEntries: 2500, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/tmssl\.akamaized\.net\/images\/wappen\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'club-crests',
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/s3\.fnl\.pro(:\d+)?\/fnl\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'second-league-images',
              expiration: { maxEntries: 600, maxAgeSeconds: 60 * 60 * 24 * 60 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: /^https:\/\/flagcdn\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'flags',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
