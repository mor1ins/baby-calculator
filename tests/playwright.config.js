import { defineConfig } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    use: {
        baseURL: process.env.BABY_E2E_URL || 'http://localhost:8080',
        viewport: { width: 390, height: 844 },
        trace: 'retain-on-failure',
        launchOptions: process.env.BABY_CHROME_PATH ? { executablePath: process.env.BABY_CHROME_PATH } : {},
    },
});
