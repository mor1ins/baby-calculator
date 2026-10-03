import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton } from './Forms.jsx';
import { useWrite } from './useApi.js';

export function NightEvents({ sleep, zone, readOnly }) {
    const mutation = useWrite();
    const [pending, setPending] = useState(null);
    const add = async () => {
        const event = pending || { id: crypto.randomUUID(), occurred_at: new Date().toISOString() };
        setPending(event);
        await mutation.mutateAsync({
            action: 'addEvent',
            key: event.id,
            parent: sleep.id,
            values: { occurred_at: event.occurred_at },
        });
        setPending(null);
    };
    const remove = (event) => mutation.mutateAsync({ action: 'deleteEvent', key: event.id, parent: sleep.id });
    const last = sleep.events.at(-1);
    return (
        <div className="night-events">
            <p>
                Ночных отметок: <strong>{sleep.events.length}</strong>
            </p>
            {!readOnly && !sleep.end && (
                <ActionButton action={add}>{pending ? 'Повторить отметку' : 'Проснулся / заплакал'}</ActionButton>
            )}
            {!readOnly && last && <ActionButton action={() => remove(last)}>Отменить последнюю</ActionButton>}
            {last && (
                <details>
                    <summary>Журнал отметок</summary>
                    <ul>
                        {sleep.events.map((event) => (
                            <li key={event.id}>
                                {new Intl.DateTimeFormat('ru', {
                                    timeZone: zone,
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                }).format(new Date(event.occurred_at))}
                                {!readOnly && <ActionButton action={() => remove(event)}>Удалить отметку</ActionButton>}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
            <p className="muted">Отметка не завершает сон и не меняет его длительность.</p>
        </div>
    );
}
NightEvents.propTypes = {
    sleep: PropTypes.object.isRequired,
    zone: PropTypes.string.isRequired,
    readOnly: PropTypes.bool,
};
