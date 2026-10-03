export class ApiError extends Error {
    constructor(code, { status = 0, fields = {} } = {}) {
        super(code);
        this.name = 'ApiError';
        this.code = code;
        this.status = status;
        this.fields = fields;
    }
}
