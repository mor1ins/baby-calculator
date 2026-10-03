export const executeAction = 'application.execute';
export const persistAction = 'infrastructure.execute';

/**
 * @typedef {{action: string, values?: object, key?: string, parent?: string, version?: number}} Action
 * @typedef {{execute(action: Action, signal?: AbortSignal): Promise<unknown>}} DiaryRepository
 */
