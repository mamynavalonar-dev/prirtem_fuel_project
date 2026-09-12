import { defineConfig } from '@playwright/test';

const sizes = [
  ['mobile-360', 360, 800],
  ['mobile-390', 390, 844],
  ['tablet-768', 768, 1024],
  ['tablet-820', 820, 1180],
  ['tablet-1024', 1024, 768],
  ['desktop-1440', 1440, 900],
  ['mobile-dark', 390, 844],
];

export default defineConfig({
  testDir: './tests/ui',
  fullyParallel: true,
  workers: 2,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    browserName: 'chromium',
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
    headless: true,
    reducedMotion: 'reduce',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: sizes.map(([name, width, height]) => ({
    name,
    use: {
      viewport: { width, height },
      isMobile: width <= 1024,
      hasTouch: width <= 1024,
      colorScheme: name.endsWith('dark') ? 'dark' : 'light',
    },
  })),
  webServer: {
    command: 'npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173/login',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
