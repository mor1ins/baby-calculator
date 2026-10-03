import { ApiError } from '../../contracts/errors.js';

function validUser(user) {
    return (
        user === null ||
        (typeof user?.id === 'string' &&
            typeof user.name === 'string' &&
            Array.isArray(user.roles) &&
            user.roles.every((role) => typeof role === 'string') &&
            typeof user.blocked === 'boolean')
    );
}

export class HttpSessionRepository {
    #client;

    constructor(client) {
        this.#client = client;
    }

    async read(signal) {
        const session = await this.#client.request('/session', { signal });
        if (!validUser(session?.user) || typeof session?.csrf_token !== 'string' || !session.csrf_token) {
            this.#client.setCsrfToken(null);
            throw new ApiError('invalid_response');
        }
        this.#client.setCsrfToken(session.csrf_token);
        return session;
    }
}
