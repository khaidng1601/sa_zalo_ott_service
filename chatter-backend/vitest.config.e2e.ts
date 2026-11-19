import { defineConfig } from 'vitest/config';

// E2E tests start the whole NestJS app against a real MongoDB.
// Set E2E_MONGODB_URL to point at another server (default: mongodb://localhost:27017).
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e-env.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
