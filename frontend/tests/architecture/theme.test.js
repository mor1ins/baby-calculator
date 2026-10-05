import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (name) => readFile(new URL(name, root), 'utf8');

test('theme palettes implement the same contract and all CSS references resolve', async () => {
    const names = ['base', 'light', 'dark'];
    const themes = await Promise.all(names.map((name) => read(`src/presentation/theme/${name}.css`)));
    const declared = (css) => [...css.matchAll(/(--[\w-]+)\s*:/g)].map((match) => match[1]);
    assert.deepEqual(declared(themes[1]).sort(), declared(themes[2]).sort());
    const tokens = new Set(themes.flatMap(declared));
    const css = await read('src/presentation/styles.css');
    for (const [, variable] of css.matchAll(/var\((--[\w-]+)/g)) {
        assert.ok(tokens.has(variable), `Undefined theme parameter: ${variable}`);
    }
    assert.doesNotMatch(css, /#[\da-f]{3,8}\b|\b(?:rgb|hsl|oklch)\(/i);
});

test('rendered source assets contain no inline styles or presentation attributes', async () => {
    const files = await readdir(new URL('src/', root), { recursive: true });
    const sources = files.filter((name) => /\.(?:jsx|js)$/.test(name)).map((name) => path.join('src', name));
    sources.push('index.html', 'public/tishe.svg');
    for (const name of sources) {
        const source = await read(name);
        assert.doesNotMatch(source, /\b(?:style|fill|stroke|strokeWidth|stroke-width|width|height)\s*=\s*[{"']/i, name);
        assert.doesNotMatch(source, /<style\b|\.style\b|\.cssText\b|\.insertRule\b/, name);
    }
});
