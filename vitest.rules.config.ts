import { defineConfig } from 'vitest/config'

// Firestore rules tests — need the emulator: `npm run test:rules`
export default defineConfig({
  test: {
    include: ['rules-tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 20_000,
    hookTimeout: 60_000,
    fileParallelism: false,
  },
})
