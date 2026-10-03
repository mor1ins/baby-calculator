const key = (value) => encodeURIComponent(value);
const routes = {
    login: () => ['POST', '/session'],
    register: () => ['POST', '/register'],
    logout: () => ['DELETE', '/session'],
    profile: () => ['PATCH', '/me'],
    schedules: () => ['GET', '/schedules'],
    createSchedule: () => ['POST', '/schedules'],
    updateSchedule: (action) => ['PATCH', `/schedules/${key(action.key)}`],
    day: (action) => ['GET', `/days/${key(action.key)}`],
    history: () => ['GET', '/days'],
    setSchedule: (action) => ['PUT', `/days/${key(action.key)}/schedule`],
    createSleep: () => ['POST', '/sleeps'],
    updateSleep: (action) => ['PATCH', `/sleeps/${key(action.key)}`],
    deleteSleep: (action) => ['DELETE', `/sleeps/${key(action.key)}`],
    addEvent: (action) => ['PUT', `/sleeps/${key(action.parent)}/events/${key(action.key)}`],
    deleteEvent: (action) => ['DELETE', `/sleeps/${key(action.parent)}/events/${key(action.key)}`],
    saveComment: (action) => ['PUT', `/comments/${key(action.key)}`],
    deleteComment: (action) => ['DELETE', `/comments/${key(action.key)}`],
    users: () => ['GET', '/admin/users'],
    status: (action) => ['PATCH', `/admin/users/${key(action.key)}/status`],
    adminDay: (action) => ['GET', `/admin/users/${key(action.parent)}/days/${key(action.key)}`],
    adminHistory: (action) => ['GET', `/admin/users/${key(action.parent)}/days`],
    adminSchedules: (action) => ['GET', `/admin/users/${key(action.parent)}/schedules`],
};

export class HttpDiaryRepository {
    constructor(client) {
        this.client = client;
    }
    async execute(action, signal) {
        const route = routes[action.action];
        if (!route) throw new Error('Unknown action');
        const [method, path] = route(action);
        const query = method === 'GET' && action.values ? `?${new URLSearchParams(action.values)}` : '';
        const result = await this.client.request(`${path}${query}`, {
            method,
            body: method === 'GET' ? undefined : action.values,
            version: action.version,
            signal,
        });
        if (['login', 'register'].includes(action.action)) this.client.setCsrfToken(result.csrf_token);
        if (action.action === 'logout') this.client.setCsrfToken(null);
        return result;
    }
}
