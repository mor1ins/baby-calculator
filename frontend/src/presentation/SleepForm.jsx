import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton, confirmedVersion, Form } from './Forms.jsx';
import { NightEvents } from './NightEvents.jsx';
import { Sheet } from './Sheet.jsx';
import { absoluteTime, inputTime } from './time.js';
import { useWrite } from './useApi.js';

export function SleepForm({ sleep, day, close, kind = 'nap', finish = false }) {
    const mutation = useWrite();
    const zone = day.timezone;
    const [selectedKind, setSelectedKind] = useState(sleep?.kind || kind);
    const waking = selectedKind === 'night_awake';
    const fields = sleepFields(sleep, waking);
    const baseline = sleepInputs(sleep, day, kind);
    const initial = finish ? { ...baseline, end: inputTime(new Date().toISOString(), zone) } : baseline;
    const current = currentSleep(day, sleep);
    const submit = async (values) => {
        const command = sleepCommand({ sleep, current, values, baseline, zone, waking });
        if (command) await mutation.mutateAsync(command);
        close();
    };
    return (
        <Sheet title={waking ? 'Ночное бодрствование' : sleep ? 'Исправить сон' : 'Записать сон'} close={close}>
            <p className="form-note">Время: {zone}</p>
            <Form
                fields={fields}
                initial={initial}
                submit={submit}
                onChange={(event) => {
                    if (event.target.name === 'kind') setSelectedKind(event.target.value);
                }}
            />
            <SleepFormActions sleep={sleep} zone={zone} waking={waking} mutation={mutation} close={close} />
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
    return (
        [...day.sleeps, day.previous_night, ...day.sleeps.flatMap((item) => item.wakings || [])].find(
            (item) => item?.id === sleep.id,
        ) || sleep
    );
}

function sleepPayload(values, zone) {
    const result = { ...values };
    if ('start' in values) result.start = absoluteTime(values.start, zone);
    if ('end' in values) result.end = values.end ? absoluteTime(values.end, zone) : null;
    return result;
}

function sleepFields(sleep, waking) {
    return [
        { name: 'day', label: 'День цикла', type: 'date', required: true, disabled: Boolean(sleep && waking) },
        {
            name: 'kind',
            label: 'Вид сна',
            disabled: Boolean(sleep && waking),
            options: [
                ['nap', 'Дневной'],
                ['night', 'Ночной'],
                ...(!sleep || waking ? [['night_awake', 'Ночное бодрствование']] : []),
            ],
        },
        {
            name: 'start',
            label: waking ? 'Начало ночного бодрствования' : 'Начало сна',
            type: 'datetime-local',
            required: true,
        },
        {
            name: 'end',
            label: waking ? 'Конец ночного бодрствования (пусто — ещё бодрствует)' : 'Конец сна (пусто — ещё спит)',
            type: 'datetime-local',
        },
    ];
}

function sleepCommand({ sleep, current, values, baseline, zone, waking }) {
    const changed = sleep
        ? Object.fromEntries(Object.entries(values).filter(([key, value]) => value !== baseline[key]))
        : values;
    if (!Object.keys(changed).length) return null;
    const resource = waking ? 'NightWaking' : 'Sleep';
    return {
        action: `${sleep ? 'update' : 'create'}${resource}`,
        key: sleep?.id,
        version: confirmedVersion(sleep?.version, current?.version),
        values: eventPayload(waking, sleep, values, changed, zone),
    };
}

function eventPayload(waking, sleep, values, changed, zone) {
    if (!waking) return sleepPayload(changed, zone);
    const bounds = sleepPayload({ start: values.start, end: values.end }, zone);
    if (sleep) {
        for (const field of ['start', 'end']) {
            if (!(field in changed)) bounds[field] = sleep[field];
        }
    }
    return { ...(!sleep ? { day: values.day } : {}), ...bounds };
}

function SleepFormActions({ sleep, zone, waking, mutation, close }) {
    return (
        <>
            {sleep?.events?.length > 0 && <NightEvents sleep={sleep} zone={zone} />}
            <div className="actions">
                <button type="button" className="secondary" onClick={close}>
                    Отмена
                </button>
                {sleep && (
                    <ActionButton
                        confirm="Удалить запись?"
                        action={async () => {
                            await mutation.mutateAsync({
                                action: waking ? 'deleteNightWaking' : 'deleteSleep',
                                key: sleep.id,
                                version: sleep.version,
                            });
                            close();
                        }}
                    >
                        {waking ? 'Удалить бодрствование' : 'Удалить сон'}
                    </ActionButton>
                )}
            </div>
        </>
    );
}
SleepFormActions.propTypes = {
    sleep: PropTypes.object,
    zone: PropTypes.string.isRequired,
    waking: PropTypes.bool.isRequired,
    mutation: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
};
