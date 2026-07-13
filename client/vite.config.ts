import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// En dev, el SPA corre en :5173 y proxea /api al backend NestJS (:3000).
// En producción no hay proxy: NestJS sirve client/dist directamente.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
