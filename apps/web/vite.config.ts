import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The browser talks to a single origin: the dev and preview servers forward the API and the
// uploaded images, as nginx does in production. That keeps the refresh cookie (SameSite=Strict)
// working and removes any need for CORS.
const apiProxy = {
  '/api': 'http://localhost:3000',
  '/uploads': 'http://localhost:3000',
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { tsconfigPaths: true },
  server: { proxy: apiProxy },
  preview: { proxy: apiProxy },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
