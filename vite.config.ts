import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      manifest: false,
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,json}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/kahotore_mmc_base_v2\.json$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'kahotore-question-data-v2',
              networkTimeoutSeconds: 4,
            },
          },
        ],
      },
    }),
  ],
})
