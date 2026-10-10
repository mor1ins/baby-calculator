import PropTypes from 'prop-types';

import { ActionButton, confirmedVersion, Form } from './Forms.jsx';
import { NightEvents } from './NightEvents.jsx';
import { Sheet } from './Sheet.jsx';
import { absoluteTime, inputTime } from './time.js';
import { useWrite } from './useApi.js';

export function SleepForm({ sleep, day, close, kind = 'nap', finish = false }) {
    const mutation = useWrite();
    const zone = day.timezone;
    const fields = [
        { name: 'day', label: 'День цикла', type: 'date', required: true },
        {
            name: 'kind',
            label: 'Вид сна',
            options: [
                ['nap', 'Дневной'],
                ['night', 'Ночной'],
            ],
        },
        { name: 'start', label: 'Начало сна', type: 'datetime-local', required: true },
        { name: 'end', label: 'Конец сна (пусто — ещё спит)', type: 'datetime-local' },
    ];
    const baseline = sleepInputs(sleep, day, kind);
    const initial = finish ? { ...baseline, end: inputTime(new Date().toISOString(), zone) } : baseline;
    const current = currentSleep(day, sleep);
    const submit = async (values) => {
        const changed = sleep
            ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== baseline[key]))
            : values;
        if (Object.keys(changed).length) {
            await mutation.mutateAsync({
                action: sleep ? 'updateSleep' : 'createSleep',
                key: sleep?.id,
                version: confirmedVersion(sleep?.version, current?.version),
                values: sleepPayload(changed, zone),
            });
        }
        close();
    };
    return (
        <Sheet title={sleep ? 'Исправить сон' : 'Записать сон'} close={close}>
            <p>Время: {zone}. Бодрствование рассчитается автоматически.</p>
            <Form fields={fields} initial={initial} submit={submit} />
            {sleep?.events?.length > 0 && <NightEvents sleep={sleep} zone={zone} />}
            <div className="actions">
                <button type="button" className="secondary" onClick={close}>
                    Отмена
                </button>
                {sleep && (
                    <ActionButton
                        confirm="Удалить запись сна? Заметки сохранятся для перепривязки."
                        action={async () => {
                            await mutation.mutateAsync({
                                action: 'deleteSleep',
                                key: sleep.id,
                                version: sleep.version,
                            });
                            close();
                        }}
                    >
                        Удалить сон
                    </ActionButton>
                )}
            </div>
        </Sheet>
    );
}
SleepForm.propTypes = {
    sleep: PropTypes.object,
    kind: PropTypes.string,
    finish: PropTypes.bool,
    day: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
};

function sleepInputs(sleep, day, kind) {
    const value = sleep || {
        day: day.date,
        kind,
        start: new Date().toISOString(),
        end: null,
    };
    return {
        day: value.day,
        kind: value.kind,
        start: inputTime(value.start, day.timezone),
        end: value.end ? inputTime(value.end, day.timezone) : '',
    };
}

function currentSleep(day, sleep) {
    if (!sleep) return null;
    return [...day.sleeps, day.previous_night].find((item) => item?.id === sleep.id) || sleep;
}

function sleepPayload(values, zone) {
    const result = { ...values };
    if ('start' in values) result.start = absoluteTime(values.start, zone);
    if ('end' in values) result.end = values.end ? absoluteTime(values.end, zone) : null;
    return result;
}
