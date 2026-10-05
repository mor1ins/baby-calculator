import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import stylelint from 'stylelint';

const root = fileURLToPath(new URL('../../', import.meta.url));
const eslint = new ESLint({ cwd: root });

const violations = [
    [
        'inline styles',
        'src/presentation/Inline.jsx',
        'export const Inline = () => <div style={{ color: "red" }} />;',
        'no-restricted-syntax',
    ],
    [
        'SVG paint',
        'src/presentation/Paint.jsx',
        'export const Paint = () => <svg stroke="red" />;',
        'no-restricted-syntax',
    ],
    ['DOM styling', 'src/presentation/paint.js', 'document.body.style.color = "red";', 'no-restricted-syntax'],
    ['unused variable', 'src/domain/example.js', 'const unused = 1;', 'no-unused-vars'],
    ['direct HTTP', 'src/presentation/example.js', "fetch('/api');", 'no-restricted-globals'],
    ['HTTP through window', 'src/presentation/example.js', "window.fetch('/api');", 'no-restricted-properties'],
    ['dynamic import', 'src/application/example.js', "import('../infrastructure/index.js');", 'no-restricted-syntax'],
    [
        'accessibility',
        'src/presentation/Photo.jsx',
        'export const Photo = () => <img src="/photo" />;',
        'jsx-a11y/alt-text',
    ],
    [
        'conditional hook',
        'src/presentation/Panel.jsx',
        `
        import { useState } from 'react';
        export function Panel({ enabled }) {
            if (enabled) { useState(0); }
            return null;
        }
    `,
        'react-hooks/rules-of-hooks',
    ],
];

for (const [name, filePath, code, rule] of violations) {
    test(`ESLint rejects ${name}`, async () => {
        const [result] = await eslint.lintText(code, { filePath: path.join(root, filePath) });
        assert.ok(
            result.messages.some((message) => message.ruleId === rule),
            JSON.stringify(result.messages),
        );
    });
}

test('ESLint accepts a pure function', async () => {
    const [result] = await eslint.lintText('export const add = (left, right) => left + right;', {
        filePath: path.join(root, 'src/domain/add.js'),
    });
    assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
});

async function createFixture(context, files) {
    const directory = await mkdtemp(path.join(tmpdir(), 'baby-frontend-quality-'));
    context.after(() => rm(directory, { recursive: true, force: true }));
    for (const [filename, content] of Object.entries(files)) {
        const target = path.join(directory, filename);
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, content);
    }
    return directory;
}

function runTool(name, args, cwd) {
    const result = spawnSync(path.join(root, 'node_modules/.bin', name), args, {
        cwd,
        encoding: 'utf8',
        timeout: 20000,
    });
    assert.ifError(result.error);
    return result;
}

const architectureCases = [
    [
        'direct cross-layer import',
        'src/presentation/entry.js',
        "import '../infrastructure/entry.js';",
        {},
        'presentation-only-own-layer-and-contracts',
    ],
    [
        'contract re-export bypass',
        'src/presentation/entry.js',
        "import '../contracts/index.js';",
        {
            'src/contracts/index.js': "export * from '../infrastructure/entry.js';",
        },
        'contracts-only-own-layer-and-contracts',
    ],
    [
        'container access',
        'src/application/entry.js',
        "import '../composition/index.js';",
        {
            'src/composition/index.js': 'export const container = {};',
        },
        'application-only-own-layer-and-contracts',
    ],
    ['framework in pure layer', 'src/domain/entry.js', "import 'node:fs';", {}, 'pure-layers-have-no-runtime-packages'],
    [
        'cycle',
        'src/domain/entry.js',
        "import './other.js';",
        {
            'src/domain/other.js': "import './entry.js';",
        },
        'no-cycles',
    ],
    ['unresolved import', 'src/domain/entry.js', "import './missing.js';", {}, 'no-unresolved'],
];

for (const [name, filename, content, extra, expectedRule] of architectureCases) {
    test(`architecture rejects ${name}`, async (context) => {
        const directory = await createFixture(context, {
            'src/infrastructure/entry.js': 'export const value = 1;',
            [filename]: content,
            ...extra,
        });
        const result = runTool(
            'depcruise',
            ['src', '--config', path.join(root, '.dependency-cruiser.cjs'), '--output-type', 'err-long'],
            directory,
        );
        assert.ok(result.status > 0, result.stdout + result.stderr);
        assert.ok(result.stdout.includes(expectedRule), result.stdout + result.stderr);
    });
}

test('architecture accepts composition and shared contracts', async (context) => {
    const directory = await createFixture(context, {
        'src/composition/index.js': "import '../application/entry.js'; import '../infrastructure/index.js';",
        'src/application/entry.js': "import '../contracts/index.js';",
        'src/contracts/index.js': 'export const commandName = "LoadDay";',
        'src/infrastructure/index.js': 'export const repository = {};',
    });
    const result = runTool(
        'depcruise',
        ['src', '--config', path.join(root, '.dependency-cruiser.cjs'), '--output-type', 'err-long'],
        directory,
    );
    assert.equal(result.status, 0, result.stdout + result.stderr);
});

test('duplicate detector rejects copied executable blocks', async (context) => {
    const code = `export function summarize(values) {
        const sorted = values.slice().sort((left, right) => left - right);
        const total = sorted.reduce((sum, value) => sum + value, 0);
        const count = sorted.length;
        const average = count === 0 ? 0 : total / count;
        const minimum = sorted[0] ?? 0;
        const maximum = sorted[count - 1] ?? 0;
        return { total, count, average, minimum, maximum };
    }`;
    const directory = await createFixture(context, { 'one.js': code, 'two.js': code });
    const result = runTool('jscpd', ['.', '--config', path.join(root, '.jscpd.json')], directory);
    assert.ok(result.status > 0, result.stdout + result.stderr);
    assert.match(result.stdout + result.stderr, /threshold/i);
});

test('CSS lint rejects invalid properties', async () => {
    const result = await stylelint.lint({
        code: '.example { colr: red; }',
        configFile: path.join(root, 'stylelint.config.js'),
    });
    assert.equal(result.errored, true);
    assert.ok(result.results[0].warnings.some((warning) => warning.rule === 'property-no-unknown'));
});
