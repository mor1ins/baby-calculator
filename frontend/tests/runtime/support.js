export function session(user = null) {
    return { user, csrf_token: 'test-csrf-token' };
}

export function member(name = 'Анна') {
    return { id: 'test-user', name, blocked: false, roles: ['user'] };
}

export function jsonResponse(body, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function deferred() {
    let resolve;
    const promise = new Promise((done) => {
        resolve = done;
    });
    return { promise, resolve };
}
