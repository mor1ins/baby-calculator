import { defineConfig } from '@playwright/test';

export default defineConfig({
    projects: [
        { name: 'integration', testDir: './e2e', timeout: 120000 },
        { name: 'visual', testDir: './visual' },
    ],
    reporter: [['list'], ['html', { open: 'never' }]],
    forbidOnly: Boolean(process.env.CI),
    retries: 0,
    fullyParallel: false,
    workers: 2,
    use: {
        baseURL: process.env.BABY_E2E_URL || 'http://localhost:8080',
        viewport: { width: 390, height: 844 },
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
        launchOptions: process.env.BABY_CHROME_PATH ? { executablePath: process.env.BABY_CHROME_PATH } : {},
    },
});
