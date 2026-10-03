import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { commands } from '../contracts/messages.js';
import { executeAction } from '../contracts/operations.js';
import { useBus } from './BusContext.jsx';

export function useSession() {
    const bus = useBus();
    return useQuery({
        queryKey: ['session'],
        queryFn: ({ signal }) => bus.send({ type: commands.loadSession }, { signal }),
    });
}

export function useRead(action, options = {}) {
    const bus = useBus();
    return useQuery({
        queryKey: ['data', action],
        queryFn: ({ signal }) => bus.send({ type: executeAction, ...action }, { signal }),
        ...options,
    });
}

export function useWrite() {
    const bus = useBus();
    const cache = useQueryClient();
    return useMutation({
        mutationFn: (action) => bus.send({ type: executeAction, ...action }),
        onError: async (error) => {
            if (error.status === 412) {
                await Promise.all([
                    cache.invalidateQueries({ queryKey: ['data'] }),
                    cache.invalidateQueries({ queryKey: ['session'] }),
                ]);
            }
            if (error.status === 401 || error.code === 'account_blocked') {
                cache.removeQueries({ queryKey: ['data'] });
                await cache.invalidateQueries({ queryKey: ['session'] });
            }
        },
        onSuccess: async (result, action) => {
            if (['login', 'register', 'logout'].includes(action.action)) {
                await cache.cancelQueries();
                cache.removeQueries({ queryKey: ['data'] });
                cache.setQueryData(['session'], action.action === 'logout' ? { user: null, csrf_token: '' } : result);
            }
            await Promise.all([
                cache.invalidateQueries({ queryKey: ['data'] }),
                cache.invalidateQueries({ queryKey: ['session'] }),
            ]);
        },
    });
}
