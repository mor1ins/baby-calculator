import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function account(context, timezone = 'Europe/Moscow') {
    const api = context.request;
    let session = await (await api.get('/api/v1/session')).json();
    const write = async (path, data, method = 'POST', version) => {
        const options = {
            method, data,
            headers: { 'X-CSRF-Token': session.csrf_token, ...(version !== undefined ? { 'If-Match': `"${version}"` } : {}) },
        };
        let response = await api.fetch('/api/v1' + path, options);
        // Independent accounts share one test server IP; respect its real registration limit.
        if (path === '/register' && response.status() === 429) {
            await new Promise(resolve => setTimeout(resolve, 61000));
            response = await api.fetch('/api/v1' + path, options);
        }
        assert(response.ok(), await response.text());
        return response.status() === 204 ? null : response.json();
    };
    session = await write('/register', {
        email: `night-waking-${randomUUID()}@example.com`, password: 'Night-Waking-test-123',
        name: 'Тест', timezone,
    });
    return { write, read: async (path) => (await api.get('/api/v1' + path)).json() };
}

