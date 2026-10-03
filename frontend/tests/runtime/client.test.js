import { describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../../src/infrastructure/apiClient.js';
import { HttpSessionRepository } from '../../src/infrastructure/repositories/session.js';
import { deferred, jsonResponse, session } from './support.js';

describe('HTTP contract', () => {
    it('bootstraps cookie/CSRF and passes versions without retrying writes', async () => {
        const transport = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(session()))
            .mockResolvedValueOnce(new Response(null, { status: 204 }));
        const client = new ApiClient(transport);
        expect(await new HttpSessionRepository(client).read()).toEqual(session());
        await expect(client.request('/sleeps/id', { method: 'DELETE', version: 3 })).resolves.toBeNull();
        expect(transport).toHaveBeenNthCalledWith(
            1,
            '/api/v1/session',
            expect.objectContaining({ credentials: 'same-origin', cache: 'no-store' }),
        );
        expect(transport).toHaveBeenNthCalledWith(
            2,
            '/api/v1/sleeps/id',
            expect.objectContaining({
                headers: expect.objectContaining({ 'X-CSRF-Token': 'test-csrf-token', 'If-Match': '"3"' }),
            }),
        );
    });

    it.each([401, 403, 412, 422, 503])('preserves status %s and structured fields', async (status) => {
        const transport = vi
            .fn()
            .mockResolvedValue(jsonResponse({ code: 'test_error', fields: { start: 'Incorrect' } }, status));
        await expect(new ApiClient(transport).request('/session')).rejects.toMatchObject({
            status,
            code: 'test_error',
            fields: { start: 'Incorrect' },
        });
        expect(transport).toHaveBeenCalledTimes(1);
    });

    it('does not send unsafe requests without CSRF or to another origin', async () => {
        const transport = vi.fn();
        const client = new ApiClient(transport);
        await expect(client.request('/session', { method: 'POST' })).rejects.toMatchObject({
            code: 'csrf_unavailable',
        });
        await expect(client.request('//other.test')).rejects.toThrow('Expected an API path');
        expect(transport).not.toHaveBeenCalled();
    });

    it.each([{}, { csrf_token: 'token', user: {} }])('rejects invalid session DTO', async (payload) => {
        const client = new ApiClient(vi.fn().mockResolvedValue(jsonResponse(payload)));
        await expect(new HttpSessionRepository(client).read()).rejects.toMatchObject({ code: 'invalid_response' });
    });

    it('ignores a response received after cancellation', async () => {
        const pending = deferred();
        const controller = new AbortController();
        const request = new ApiClient(() => pending.promise).request('/session', { signal: controller.signal });
        controller.abort();
        pending.resolve(jsonResponse(session()));
        await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    });
});

it('keeps a valid CSRF token while a background session refresh is pending', async () => {
    const pending = deferred();
    const transport = vi
        .fn()
        .mockResolvedValueOnce(jsonResponse(session()))
        .mockReturnValueOnce(pending.promise)
        .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = new ApiClient(transport);
    const repository = new HttpSessionRepository(client);
    await repository.read();
    const refreshing = repository.read();
    await expect(client.request('/session', { method: 'DELETE' })).resolves.toBeNull();
    pending.resolve(jsonResponse(session()));
    await refreshing;
});
