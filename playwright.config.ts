import { defineConfig, devices } from '@playwright/test';

const invalidPlaybackId = 'invalid-playback-id-for-browser-smoke';
const testPort = process.env.PLAYWRIGHT_PORT ?? '3000';

export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: 'test-results',
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: `http://127.0.0.1:${testPort}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: {
    command: `npm run build && ./node_modules/.bin/next start --hostname 0.0.0.0 --port ${testPort}`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    env: {
      ...process.env,
      NEXT_PUBLIC_MUX_PLAYBACK_ID: invalidPlaybackId,
    },
  },
});

export { invalidPlaybackId };
