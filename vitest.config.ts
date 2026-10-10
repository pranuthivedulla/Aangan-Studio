import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@config': fileURLToPath(new URL('./config', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // The pipeline must run with zero credentials (T19). A test that reaches a
    // real integration is a bug, so no .env is loaded here, ever.
    env: { ADAPTER_MODE: 'mock' },
    reporters: ['default'],
  },
});
