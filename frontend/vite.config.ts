import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"],
      manifest: {
        name: "SAARTHI — Class 9 Science (Odia)",
        short_name: "SAARTHI",
        description: "Offline-first, Odia-first adaptive learning companion for Class 9 Science",
        lang: "or",
        start_url: "/",
        display: "standalone",
        background_color: "#f8fafc",
        theme_color: "#02569e",
        orientation: "portrait",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // Cache the app shell first (cache-first); versioned packs are cached
        // by URL pattern (cache-first with versioned URLs).
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/packs/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/packs/"),
            handler: "CacheFirst",
            options: {
              cacheName: "saarthi-packs",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/api/v1/"),
            handler: "NetworkFirst",
            options: {
              cacheName: "saarthi-api",
              networkTimeoutSeconds: 5,
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        navigateFallbackDenylist: [/^\/api\/.*/],
      },
      devOptions: {
        enabled: true,
        type: "module",
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
});
