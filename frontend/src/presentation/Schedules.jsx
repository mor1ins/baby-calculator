import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton, confirmedVersion, ErrorMessage, Form, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { intervalNames } from './labels.js';
import { Sheet } from './Sheet.jsx';
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
            <legend>Промежутки, ч:мм</legend>
            {value.map((segment, index) => (
                <label key={`${segment.kind}-${index}`}>
                    <span>
                        {index + 1}. {intervalNames[segment.kind]}
                    </span>
                    <DurationInput
                        label={`${intervalNames[segment.kind]} ${index + 1}`}
                        minutes={segment.duration_minutes}
                        change={(minutes) => edit(index, minutes)}
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
        <Sheet title={schedule ? 'Изменить график' : 'Новый график'} close={close}>
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
        </Sheet>
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
    const [editing, setEditing] = useState(undefined);
    return (
        <Loading query={query}>
            <p className="muted">График «По умолчанию» автоматически применяется к новым дням.</p>
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
                <section
                    className={`card schedule-card ${user.default_schedule_id === schedule.id ? 'selected' : ''}`}
                    key={schedule.id}
                >
                    <h2 className="card-heading">
                        <Icon name="moon" />
                        {schedule.name} {schedule.archived && '· в архиве'}
                    </h2>
                    {user.default_schedule_id === schedule.id && <span className="badge">По умолчанию</span>}
                    <SchedulePreview segments={schedule.segments} />
                    <ScheduleSummary segments={schedule.segments} />
                    {!owner && <ScheduleActions schedule={schedule} user={user} edit={() => setEditing(schedule)} />}
                </section>
            ))}
            {!owner && (
                <button className="outline-button" type="button" onClick={() => setEditing(null)}>
                    <Icon name="plus" /> Новый график
                </button>
            )}
        </Loading>
    );
}
Schedules.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };

function ScheduleActions({ schedule, user, edit }) {
    const [open, setOpen] = useState(false);
    const mutation = useWrite();
    const run = async (action) => {
        await mutation.mutateAsync(action);
        setOpen(false);
    };
    return (
        <div className="schedule-actions">
            <button type="button" className="schedule-edit" onClick={edit}>
                Изменить график
            </button>
            <button
                type="button"
                className="schedule-more"
                aria-label={`Действия с графиком «${schedule.name}»`}
                aria-haspopup="dialog"
                onClick={() => setOpen(true)}
            >
                <Icon name="more" />
            </button>
            {!schedule.archived && user.default_schedule_id !== schedule.id && (
                <ActionButton
                    className="schedule-default"
                    action={() =>
                        run({
                            action: 'profile',
                            version: user.version,
                            values: { default_schedule_id: schedule.id },
                        })
                    }
                >
                    Сделать по умолчанию
                </ActionButton>
            )}
            {open && (
                <Sheet title={schedule.name} close={() => setOpen(false)}>
                    <div className="schedule-options">
                        <ActionButton
                            action={() =>
                                run({
                                    action: 'createSchedule',
                                    values: {
                                        name: `${schedule.name.slice(0, 70)} — копия`,
                                        segments: schedule.segments,
                                    },
                                })
                            }
                        >
                            Копировать график
                        </ActionButton>
                        <ActionButton
                            action={() =>
                                run({
                                    action: 'updateSchedule',
                                    key: schedule.id,
                                    version: schedule.version,
                                    values: { archived: !schedule.archived },
                                })
                            }
                        >
                            {schedule.archived ? 'Вернуть из архива' : 'В архив'}
                        </ActionButton>
                    </div>
                </Sheet>
            )}
        </div>
    );
}
ScheduleActions.propTypes = {
    schedule: PropTypes.object.isRequired,
    user: PropTypes.object.isRequired,
    edit: PropTypes.func.isRequired,
};

function scheduleName(day) {
    return day?.schedule?.name || 'без графика';
}

function ScheduleSummary({ segments }) {
    const naps = segments.filter((segment) => segment.kind === 'nap');
    const minutes = (items) => items.reduce((total, item) => total + item.duration_minutes, 0);
    return (
        <p className="schedule-summary">
            Дневных снов: {naps.length} · {duration(minutes(naps) * 60)}
            <br />
            Полный цикл · {duration(minutes(segments) * 60)}
        </p>
    );
}
ScheduleSummary.propTypes = { segments: PropTypes.array.isRequired };

function DurationInput({ label, minutes, change }) {
    const [text, setText] = useState(`${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`);
    const input = (event) => {
        const value = event.target.value;
        setText(value);
        const [hours, remainder] = value.split(':').map(Number);
        const total = hours * 60 + remainder;
        const valid = /^\d{1,2}:[0-5]\d$/.test(value) && total > 0 && total <= 1440;
        event.target.setCustomValidity(valid ? '' : 'Укажите длительность от 0:01 до 24:00');
        if (valid) change(total);
    };
    return (
        <input
            aria-label={label}
            type="text"
            inputMode="text"
            placeholder="4:20"
            required
            value={text}
            onChange={input}
        />
    );
}
DurationInput.propTypes = {
    label: PropTypes.string.isRequired,
    minutes: PropTypes.number.isRequired,
    change: PropTypes.func.isRequired,
};

function SchedulePreview({ segments }) {
    const total = segments.reduce((sum, part) => sum + part.duration_minutes, 0);
    let position = 0;
    return (
        <svg className="mini-plan" viewBox={`0 0 ${total} 24`} preserveAspectRatio="none" aria-hidden="true">
            {segments.map((part, index) => {
                const start = position;
                position += part.duration_minutes;
                return <path key={index} className={part.kind} d={`M${start} 0H${position}V24H${start}Z`} />;
            })}
        </svg>
    );
}
SchedulePreview.propTypes = { segments: PropTypes.array.isRequired };
