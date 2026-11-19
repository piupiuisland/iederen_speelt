import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  // Relative base so the same build works on GitHub Pages sub-paths, Vercel and Netlify.
  base: "./",
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // "prompt": the app decides when to reload (never in the middle of a tap).
      registerType: "prompt",
      manifest: {
        name: "Iedereen Speelt – eerlijk wisselen",
        short_name: "Iedereen Speelt",
        description: "Fair playing time for youth football",
        theme_color: "#15803d",
        background_color: "#ffffff",
        display: "standalone",
        orientation: "portrait",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,webmanifest}"],
      },
    }),
  ],
});
