import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { themeModes, themePreference, themeQueryKey } from '../../contracts/theme.js';
import { useBus } from '../BusContext.jsx';

const labels = { auto: 'Авто', light: 'Светлая', dark: 'Тёмная' };

export function ThemeSelector() {
    const bus = useBus();
    const [pendingMode, setPendingMode] = useState(null);
    const cache = useQueryClient();
    const query = useQuery({
        queryKey: themeQueryKey,
        queryFn: () => bus.send({ type: themePreference, action: 'read' }),
        staleTime: Infinity,
    });
    const mutation = useMutation({
        mutationFn: (mode) => bus.send({ type: themePreference, action: 'write', mode }),
        onSuccess: (preference) => cache.setQueryData(themeQueryKey, preference),
        onSettled: () => setPendingMode(null),
    });
    return (
        <fieldset className="theme-selector" disabled={query.isPending || query.isError}>
            <legend>Тема оформления</legend>
            <div className="theme-options">
                {themeModes.map((mode) => (
                    <label className="theme-option" key={mode}>
                        <input
                            type="radio"
                            name="theme"
                            value={mode}
                            checked={(pendingMode ?? query.data?.mode) === mode}
                            onChange={() => {
                                setPendingMode(mode);
                                mutation.mutate(mode);
                            }}
                        />
                        <span className="theme-option-label">{labels[mode]}</span>
                    </label>
                ))}
            </div>
            {(query.isError || mutation.isError) && <p role="alert">Не удалось изменить тему. Попробуйте ещё раз.</p>}
        </fieldset>
    );
}
