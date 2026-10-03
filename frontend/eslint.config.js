import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import simpleImportSort from 'eslint-plugin-simple-import-sort';
import globals from 'globals';

const ioNames = ['fetch', 'XMLHttpRequest', 'WebSocket', 'localStorage', 'sessionStorage', 'indexedDB'];

export default [
    { ignores: ['node_modules/**', 'dist/**', 'coverage/**', 'reports/**'] },
    {
        files: ['**/*.{js,jsx,cjs,mjs}'],
        ...js.configs.recommended,
        plugins: { 'simple-import-sort': simpleImportSort },
        languageOptions: { ecmaVersion: 'latest' },
        linterOptions: { reportUnusedDisableDirectives: 'error' },
        rules: {
            ...js.configs.recommended.rules,
            'simple-import-sort/imports': 'error',
            'simple-import-sort/exports': 'error',
            eqeqeq: ['error', 'always'],
            'no-var': 'error',
            'prefer-const': 'error',
            'no-eval': 'error',
            'no-new-func': 'error',
            complexity: ['error', 10],
            'max-depth': ['error', 4],
            'no-duplicate-imports': 'error',
        },
    },
    {
        files: ['*.{js,cjs,mjs}', 'tests/**/*.js'],
        languageOptions: { globals: globals.node },
    },
    {
        files: ['src/{presentation,infrastructure,composition}/**/*.{js,jsx}'],
        languageOptions: { globals: globals.browser },
    },
    {
        files: ['src/**/*.{js,jsx}'],
        rules: {
            'no-restricted-syntax': [
                'error',
                { selector: 'ImportExpression', message: 'Dynamic imports require an explicit architecture decision.' },
                { selector: 'CallExpression[callee.name="require"]', message: 'Use static ESM imports.' },
            ],
        },
    },
    {
        files: ['src/{presentation,application,domain,contracts,messaging}/**/*.{js,jsx}'],
        rules: {
            'no-restricted-globals': ['error', ...ioNames],
            'no-restricted-properties': [
                'error',
                ...ioNames.map((property) => ({
                    property,
                    message: 'I/O belongs to an injected repository in infrastructure.',
                })),
            ],
        },
    },
    {
        files: ['**/*.jsx'],
        ...react.configs.flat.recommended,
        settings: { react: { version: '19.0' } },
        rules: {
            ...react.configs.flat.recommended.rules,
            ...react.configs.flat['jsx-runtime'].rules,
        },
    },
    {
        files: ['**/*.{js,jsx}'],
        plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y },
        rules: {
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'error',
            ...jsxA11y.configs.recommended.rules,
        },
    },
    prettier,
];
