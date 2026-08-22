import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  '/api': {
    target: process.env.VITE_API_PROXY_TARGET || 'http://localhost:3001',
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // DEV convenience: allow the frontend to call /api/* without CORS headaches.
    // If VITE_API_URL is not set, the app falls back to same-origin /api calls.
    proxy: apiProxy,
  },
  preview: {
    port: 5173,
    proxy: apiProxy,
  },
  build: {
    outDir: 'dist',
    // Three.js vit dans un chunk separe charge apres le formulaire. Sa taille
    // est attendue et ne ralentit pas le bundle initial.
    chunkSizeWarningLimit: 600,
  }
});
