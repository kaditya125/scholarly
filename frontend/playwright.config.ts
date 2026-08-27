import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration.
 *
 * @playwright/test was already a devDependency but no config file existed, so the specs in
 * tests/e2e/ had no way to run — they carried absolute http://localhost:5173 URLs and were
 * presumably driven by hand. This adds the missing runner config; it does not touch those
 * specs, which still target their own hardcoded origin and an authenticated route.
 *
 * baseURL is the dev server's real port (server.ts pins 3000), so new specs can use relative
 * paths. reuseExistingServer means an already-running `npm run dev` is used as-is rather than
 * fighting it for the port.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
