import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // DEV convenience: allow the frontend to call /api/* without CORS headaches.
    // If VITE_API_URL is not set, the app falls back to same-origin /api calls.
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
  }
});
