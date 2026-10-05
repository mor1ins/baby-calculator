import { changeTheme } from '../application/themePreference.js';
import { themePreference, themeQueryKey, themeStorage } from '../contracts/theme.js';
import { themeHandler } from '../infrastructure/themePreference.js';

export function themeBindings(repository) {
    return {
        [themePreference]: { layer: 'application', handle: changeTheme },
        [themeStorage]: { layer: 'infrastructure', handle: themeHandler(repository) },
    };
}

export async function startTheme({ bus, queryClient }, repository, root) {
    const apply = (preference) => {
        root.dataset.theme = preference.resolved;
        queryClient.setQueryData(themeQueryKey, preference);
    };
    apply(await bus.send({ type: themePreference, action: 'read' }));
    return repository.subscribe(apply);
}
