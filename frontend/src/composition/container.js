import { QueryClient } from '@tanstack/react-query';

import { executeAction } from '../application/executeAction.js';
import { loadSession } from '../application/loadSession.js';
import { commands } from '../contracts/messages.js';
import { executeAction as actionType, persistAction } from '../contracts/operations.js';
import { ApiClient } from '../infrastructure/apiClient.js';
import { actionHandler } from '../infrastructure/executeAction.js';
import { sessionReader } from '../infrastructure/readSession.js';
import { BrowserDiaryRepository, browserFiles } from '../infrastructure/repositories/browserDiary.js';
import { HttpDiaryRepository } from '../infrastructure/repositories/diary.js';
import { HttpSessionRepository } from '../infrastructure/repositories/session.js';
import { BrowserThemeRepository } from '../infrastructure/repositories/theme.js';
import { MessageBus } from '../messaging/MessageBus.js';
import { startTheme, themeBindings } from './theme.js';

export function createRuntime({
    transport = globalThis.fetch.bind(globalThis),
    repository,
    diaryRepository,
    themeRepository = new BrowserThemeRepository(),
} = {}) {
    const client = new ApiClient(transport);
    const sessionRepository = repository ?? new HttpSessionRepository(client);
    const diary = diaryRepository ?? new BrowserDiaryRepository(new HttpDiaryRepository(client), browserFiles);
    const bus = new MessageBus({
        ...themeBindings(themeRepository),
        [actionType]: { layer: 'application', handle: executeAction },
        [persistAction]: { layer: 'infrastructure', handle: actionHandler(diary) },
        [commands.loadSession]: { layer: 'application', handle: loadSession },
        [commands.readSession]: { layer: 'infrastructure', handle: sessionReader(sessionRepository) },
    });
    const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false, staleTime: 30000 }, mutations: { retry: false } },
    });
    return { bus, queryClient, startTheme: (root) => startTheme({ bus, queryClient }, themeRepository, root) };
}
