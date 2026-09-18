import { defineConfig, devices } from "@playwright/test";

const invalidPlaybackId = "invalid-playback-id-for-browser-smoke";
const managementTestSecret = "playwright-management-secret-at-least-32-bytes";
const testPort = process.env.PLAYWRIGHT_PORT ?? "3000";
const externalBaseUrl = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: "./tests/browser",
  // Text rasterization differs between macOS development and Linux CI even
  // after fonts have loaded. Keep reviewed baselines for each rendering
  // platform rather than weakening pixel comparisons for every screenshot.
  snapshotPathTemplate: `{testDir}/{testFilePath}-snapshots/{arg}-${process.platform}{ext}`,
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  outputDir: "test-results",
  reporter: [
    ["line"],
    ["html", { open: "never", outputFolder: "playwright-report" }],
  ],
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${testPort}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  webServer: externalBaseUrl
    ? undefined
    : {
        command: `npm run build && ./node_modules/.bin/next start --hostname 0.0.0.0 --port ${testPort}`,
        url: `http://127.0.0.1:${testPort}`,
        reuseExistingServer: false,
        timeout: 120_000,
        gracefulShutdown: { signal: "SIGTERM", timeout: 5_000 },
        env: {
          ...process.env,
          NEXT_PUBLIC_MUX_PLAYBACK_ID: invalidPlaybackId,
          BOOKING_MANAGEMENT_SECRET:
            process.env.BOOKING_MANAGEMENT_SECRET ?? managementTestSecret,
          BOOKING_CHANGES_URL:
            process.env.BOOKING_CHANGES_URL ??
            "http://127.0.0.1:3000/booking/manage",
          BOOKING_MANAGEMENT_VISUAL_FIXTURES: "enabled",
        },
      },
});

export { invalidPlaybackId, managementTestSecret };
