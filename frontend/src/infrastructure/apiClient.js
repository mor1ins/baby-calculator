import { ApiError } from '../contracts/errors.js';

async function readBody(response, signal) {
    if (response.status === 204) return null;
    try {
        return await response.json();
    } catch (error) {
        if (signal?.aborted || error.name === 'AbortError') throw error;
        throw new ApiError('invalid_response', { status: response.status });
    }
}

export class ApiClient {
    #transport;
    #csrfToken = null;

    constructor(transport) {
        this.#transport = transport;
    }

    setCsrfToken(token) {
        this.#csrfToken = token;
    }

    async request(path, { method = 'GET', body, version, signal } = {}) {
        signal?.throwIfAborted();
        if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected an API path');
        const headers = this.#headers(method, body, version);
        const response = await this.#send(path, {
            method,
            headers,
            credentials: 'same-origin',
            cache: 'no-store',
            signal,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        signal?.throwIfAborted();
        const data = await readBody(response, signal);
        signal?.throwIfAborted();
        return this.#result(response, data);
    }

    #result(response, data) {
        if (!response.ok) {
            const error = new ApiError(data?.code || 'http_error', { status: response.status, fields: data?.fields });
            error.message = data?.message || 'Не удалось выполнить запрос';
            throw error;
        }
        return data;
    }

    async #send(path, options) {
        try {
            return await this.#transport(`/api/v1${path}`, options);
        } catch (error) {
            if (options.signal?.aborted || error.name === 'AbortError') throw error;
            throw new ApiError('network_error');
        }
    }

    #headers(method, body, version) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (version !== undefined) headers['If-Match'] = `"${version}"`;
        if (!['GET', 'HEAD'].includes(method)) {
            if (!this.#csrfToken) throw new ApiError('csrf_unavailable');
            headers['X-CSRF-Token'] = this.#csrfToken;
        }
        return headers;
    }
}
