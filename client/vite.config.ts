import react from '@vitejs/plugin-react';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // In dev, forward API calls to the Express server. In production both are
    // served from the same Vercel domain, so no proxy or CORS is needed.
    proxy: {'/api': 'http://localhost:3001'},
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
