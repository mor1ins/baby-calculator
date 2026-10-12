import PropTypes from 'prop-types';
import { useState } from 'react';

import { confirmedVersion, Form } from './Forms.jsx';
import { Sheet } from './Sheet.jsx';
import { absoluteTime, inputTime } from './time.js';
import { useWrite } from './useApi.js';

export function FinishNight({ sleep, day, close }) {
    const mutation = useWrite();
    const [openedAt] = useState(() => new Date().toISOString());
    const initialEnd = inputTime(openedAt, day.timezone);
    const lastWaking = [...(sleep.wakings || [])]
        .sort((left, right) => Date.parse(left.start) - Date.parse(right.start))
        .at(-1);
    const start = lastWaking ? lastWaking.end || lastWaking.start : sleep.start;
    const current = day.sleeps.find((item) => item.id === sleep.id);
    return (
        <Sheet title="Пробуждение" close={close}>
            <Form
                fields={[
                    { name: 'day', label: 'День цикла', type: 'date', readOnly: true },
                    {
                        name: 'start',
                        label: lastWaking && !lastWaking.end ? 'Начало ночного бодрствования' : 'Начало сна',
                        type: 'datetime-local',
                        readOnly: true,
                    },
                    { name: 'end', label: 'Время пробуждения', type: 'datetime-local', required: true },
                ]}
                initial={{
                    day: sleep.day,
                    start: inputTime(start, day.timezone),
                    end: initialEnd,
                }}
                submit={async ({ end }) => {
                    await mutation.mutateAsync({
                        action: 'updateSleep',
                        key: sleep.id,
                        version: confirmedVersion(sleep.version, current?.version),
                        values: { end: end === initialEnd ? openedAt : absoluteTime(end, day.timezone) },
                    });
                    close();
                }}
            />
            <button type="button" className="secondary" onClick={close}>
                Отмена
            </button>
        </Sheet>
    );
}
FinishNight.propTypes = {
    sleep: PropTypes.object.isRequired,
    day: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
};
