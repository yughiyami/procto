import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// No dev proxy needed: the API sets CORS headers itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
  },
  preview: { headers: { 'Cache-Control': 'no-store' } },
  build: {
    target: 'es2022',
  },
});
