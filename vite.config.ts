import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig(({ mode }) => ({
  base: mode === 'github-pages' ? (process.env.PAGES_BASE_PATH ?? '/CoreTaxGPT/') : '/',
  plugins: [react()],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true },
  test: { include: ['tests/domain/**/*.test.ts', 'tests/integration/**/*.test.ts'], environment: 'node' },
}));
