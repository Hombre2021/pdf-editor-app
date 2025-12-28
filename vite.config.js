import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],

  // ✅ Correct for Electron/file:// builds
  base: "./",

  build: {
    outDir: "dist",
    assetsDir: "assets",
    rollupOptions: {
      output: {
        manualChunks: {
          pdfjs: ["pdfjs-dist"],
        },
      },
    },
  },

  server: {
    port: 5175,
    strictPort: true,

    // ✅ Dev-only CSP. In production (Electron) you usually set CSP in index.html or BrowserWindow headers.
    headers: {
      "Content-Security-Policy": [
        "default-src 'self';",
        // pdf.js can require eval in dev depending on sourcemaps / tooling; if you can remove it later, do.
        "script-src 'self' 'unsafe-inline' 'unsafe-eval';",
        "style-src 'self' 'unsafe-inline';",
        "img-src 'self' data: blob:;",
        // Allow backend + blob for worker fetching
        "connect-src 'self' http://localhost:8000 blob:;",
        // ✅ pdf.js worker from built asset will be blob: or self depending on bundler
        "worker-src 'self' blob:;",
        // Optional: if you later embed fonts
        "font-src 'self' data: blob:;",
      ].join(" "),
    },
  },

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  optimizeDeps: {
    include: [
      "pdfjs-dist",
      "pdfjs-dist/build/pdf.worker.min",
    ],
  },

  // ✅ Good to keep for worker support
  worker: {
    format: "es",
  },
});
