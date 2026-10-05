import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
    plugins: [
        react(),
        {
            name: 'theme-before-first-paint',
            transformIndexHtml: {
                order: 'post',
                // Vite recreates the entry script during build and drops its custom attributes.
                handler: (html) =>
                    html.replace(
                        '<script type="module" crossorigin',
                        '<script type="module" blocking="render" crossorigin',
                    ),
            },
        },
    ],
    server: { host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8000' } },
    test: {
        environment: 'jsdom',
        include: ['tests/runtime/**/*.test.{js,jsx}'],
        setupFiles: ['./tests/runtime/setup.js'],
        restoreMocks: true,
    },
});
