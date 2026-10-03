import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton, confirmedVersion, ErrorMessage, Form, Loading } from './Forms.jsx';
import { intervalNames } from './labels.js';
import { duration, today } from './time.js';
import { useRead, useWrite } from './useApi.js';

const initialSegments = [
    ['awake', 260],
    ['nap', 80],
    ['awake', 280],
    ['nap', 20],
    ['awake', 180],
    ['night', 600],
].map(([kind, duration_minutes]) => ({ kind, duration_minutes }));

const nameField = [{ name: 'name', label: 'Название графика', required: true, maxLength: 80 }];

function Segments({ value, change }) {
    const edit = (index, minutes) =>
        change(
            value.map((segment, position) =>
                position === index ? { ...segment, duration_minutes: Number(minutes) } : segment,
            ),
        );
    return (
        <fieldset>
            <legend>Промежутки, в минутах</legend>
            {value.map((segment, index) => (
                <label key={`${segment.kind}-${index}`}>
                    <span>
                        {index + 1}. {intervalNames[segment.kind]}
                    </span>
                    <input
                        aria-label={`${intervalNames[segment.kind]} ${index + 1}`}
                        type="number"
                        min="1"
                        max="1440"
                        required
                        value={segment.duration_minutes}
                        onChange={(event) => edit(index, event.target.value)}
                    />
                </label>
            ))}
            <div className="actions">
                <button
                    type="button"
                    onClick={() =>
                        change([
                            ...value.slice(0, -1),
                            { kind: 'nap', duration_minutes: 60 },
                            { kind: 'awake', duration_minutes: 180 },
                            value.at(-1),
                        ])
                    }
                >
                    Добавить сон
                </button>
                {value.length > 2 && (
                    <button type="button" onClick={() => change([...value.slice(0, -3), value.at(-1)])}>
                        Убрать последний сон
                    </button>
                )}
            </div>
        </fieldset>
    );
}
Segments.propTypes = { value: PropTypes.array.isRequired, change: PropTypes.func.isRequired };

function ScheduleEditor({ schedule, current, user, close }) {
    const initial = schedule || { name: '', segments: initialSegments };
    const [segments, setSegments] = useState(initial.segments);

    const [saved, setSaved] = useState(null);
    const [applicationError, setApplicationError] = useState(null);
    const day = useRead({ action: 'day', key: today(user.timezone) });
    const mutation = useWrite();
    const apply = async (template, version) => {
        await mutation.mutateAsync({
            action: 'setSchedule',
            key: today(user.timezone),
            version,
            values: { schedule_id: template.id },
        });
        close();
    };
    const submit = async ({ name, mode }) => {
        const template = await mutation.mutateAsync({
            action: schedule ? 'updateSchedule' : 'createSchedule',
            key: initial.id,
            version: confirmedVersion(initial.version, current?.version),
            values: { name, segments },
        });
        setSaved(template);
        if (mode !== 'today') {
            close();
            return;
        }
        try {
            await apply(template, day.data.version);
        } catch (error) {
            setApplicationError(error);
        }
    };
    const fields = [
        ...nameField,
        {
            name: 'mode',
            label: 'Применение изменений',
            options: [
                ['future', 'Для следующих дней'],
                ['today', 'Начиная с сегодняшнего дня'],
            ],
        },
    ];
    return (
        <section className="card">
            <h2>{schedule ? 'Изменить график' : 'Новый график'}</h2>
            {saved ? (
                <div role="status">
                    <p>График сохранён, но не применён к сегодняшнему дню.</p>
                    <ErrorMessage error={applicationError} />
                    <p>Сегодня: {scheduleName(day.data)}. После сверки можно применить сохранённый шаблон.</p>
                    <button type="button" onClick={() => day.refetch()}>
                        Обновить выбранный график
                    </button>
                    <ActionButton
                        action={() => apply(saved, day.data.version)}
                        confirm="Заменить график сегодняшнего дня?"
                    >
                        Применить к сегодня
                    </ActionButton>
                </div>
            ) : (
                <Form fields={fields} initial={{ name: initial.name, mode: 'future' }} submit={submit}>
                    <Segments value={segments} change={setSegments} />
                    <p>Сегодня: {scheduleName(day.data)}. Режим «Начиная с сегодняшнего дня» заменит этот план.</p>
                </Form>
            )}
            <button type="button" className="secondary" onClick={close}>
                Закрыть
            </button>
        </section>
    );
}
ScheduleEditor.propTypes = {
    schedule: PropTypes.object,
    current: PropTypes.object,
    user: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
};

export function Schedules({ user, owner }) {
    const query = useRead(owner ? { action: 'adminSchedules', parent: owner } : { action: 'schedules' });
    const mutation = useWrite();
    const [editing, setEditing] = useState(undefined);
    return (
        <Loading query={query}>
            {!owner && (
                <button type="button" onClick={() => setEditing(null)}>
                    Новый график
                </button>
            )}
            {editing !== undefined && (
                <ScheduleEditor
                    key={editing?.id || 'new'}
                    schedule={editing}
                    current={query.data?.items.find((item) => item.id === editing?.id)}
                    user={user}
                    close={() => setEditing(undefined)}
                />
            )}
            {query.data?.items.length === 0 && <p>Графиков пока нет. Создайте первый план дня.</p>}
            {query.data?.items.map((schedule) => (
                <section className="card" key={schedule.id}>
                    <h2>
                        {schedule.name} {schedule.archived && '· в архиве'}
                    </h2>
                    <p>
                        {schedule.segments
                            .map((part) => `${intervalNames[part.kind]} ${duration(part.duration_minutes * 60)}`)
                            .join(' → ')}
                    </p>
                    {!owner && (
                        <div className="actions">
                            <button type="button" onClick={() => setEditing(schedule)}>
                                Изменить
                            </button>
                            <ActionButton
                                action={() =>
                                    mutation.mutateAsync({
                                        action: 'createSchedule',
                                        values: {
                                            name: `${schedule.name.slice(0, 70)} — копия`,
                                            segments: schedule.segments,
                                        },
                                    })
                                }
                            >
                                Копировать
                            </ActionButton>
                            <ActionButton
                                action={() =>
                                    mutation.mutateAsync({
                                        action: 'updateSchedule',
                                        key: schedule.id,
                                        version: schedule.version,
                                        values: { archived: !schedule.archived },
                                    })
                                }
                            >
                                {schedule.archived ? 'Вернуть из архива' : 'В архив'}
                            </ActionButton>
                            {!schedule.archived && (
                                <ActionButton
                                    action={() =>
                                        mutation.mutateAsync({
                                            action: 'profile',
                                            version: user.version,
                                            values: { default_schedule_id: schedule.id },
                                        })
                                    }
                                >
                                    {user.default_schedule_id === schedule.id ? 'По умолчанию ✓' : 'По умолчанию'}
                                </ActionButton>
                            )}
                        </div>
                    )}
                </section>
            ))}
        </Loading>
    );
}
Schedules.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };

function scheduleName(day) {
    return day?.schedule?.name || 'без графика';
}
