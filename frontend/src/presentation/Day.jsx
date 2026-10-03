import PropTypes from 'prop-types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ActionButton, Form, Loading } from './Forms.jsx';
import { intervalNames } from './labels.js';
import { NightEvents } from './NightEvents.jsx';
import { Note, OrphanedNotes } from './Notes.jsx';
import { SleepForm } from './SleepForm.jsx';
import { clockTime, dateShift, duration, today } from './time.js';
import { useRead, useWrite } from './useApi.js';

const issues = {
    missing_morning: 'Утренняя граница неизвестна. Добавьте предыдущую ночь и окончательный подъём.',
    missing_night_end: 'День ещё не завершён.',
    no_schedule: 'График не выбран — прогноз пока недоступен.',
    plan_exceeded: 'Текущий промежуток длиннее плана. Прогноз сдвигается.',
    extra_naps: 'Снов больше, чем в графике.',
    unassigned_comments: 'Есть заметки, которым нужно выбрать новый интервал.',
};

export function Metrics({ value }) {
    return (
        <div className="metrics">
            {[
                ['day_sleep_seconds', 'Дневной сон'],
                ['night_sleep_seconds', 'Ночной сон'],
                ['day_awake_seconds', 'Бодрствование'],
            ].map(([key, label]) => (
                <div key={key}>
                    <span>{label}</span>
                    <strong>{duration(value[key])}</strong>
                </div>
            ))}
        </div>
    );
}
Metrics.propTypes = { value: PropTypes.object.isRequired };

function ScheduleChoice({ day }) {
    const schedules = useRead({ action: 'schedules' });
    const mutation = useWrite();
    return (
        <details className="card">
            <summary>График: {day.schedule?.name || 'не выбран'}</summary>
            <Form
                key={day.date}
                fields={[
                    {
                        name: 'schedule_id',
                        label: 'План этого дня',
                        options: [
                            ['', 'Без графика'],
                            ...(schedules.data?.items || [])
                                .filter((item) => !item.archived)
                                .map((item) => [item.id, item.name]),
                        ],
                    },
                ]}
                initial={{ schedule_id: day.schedule?.source_id || '' }}
                submit={({ schedule_id }) =>
                    mutation.mutateAsync({
                        action: 'setSchedule',
                        key: day.date,
                        version: day.version,
                        values: { schedule_id: schedule_id || null },
                    })
                }
            />
        </details>
    );
}
ScheduleChoice.propTypes = { day: PropTypes.object.isRequired };

function TimelineEntry({ entry, day, edit, readOnly }) {
    const sleep = day.sleeps.find((item) => item.id === entry.sleep_id);
    return (
        <section className={`card timeline-entry ${entry.status}`}>
            <p className="muted">
                {entry.status === 'forecast' ? 'Прогноз' : entry.status === 'ongoing' ? 'Сейчас' : 'Факт'}
            </p>
            <h2>{intervalNames[entry.kind]}</h2>
            <p className="interval-time">
                {clockTime(entry.start, day.timezone)} — {entry.end ? clockTime(entry.end, day.timezone) : 'сейчас'}
            </p>
            <p>{duration(entry.duration_seconds)}</p>
            {entry.expected_end && <p>Ориентир: {clockTime(entry.expected_end, day.timezone)}</p>}
            {entry.status !== 'forecast' && (
                <>
                    {!readOnly && <IntervalControls entry={entry} day={day} edit={edit} sleep={sleep} />}
                    <Note interval={entry} readOnly={readOnly} />
                    {sleep?.kind === 'night' && <NightEvents sleep={sleep} zone={day.timezone} readOnly={readOnly} />}
                </>
            )}
        </section>
    );
}
TimelineEntry.propTypes = {
    entry: PropTypes.object.isRequired,
    day: PropTypes.object.isRequired,
    edit: PropTypes.func.isRequired,
    readOnly: PropTypes.bool,
};

function DayContent({ day, readOnly }) {
    const [editing, setEditing] = useState(undefined);
    const mutation = useWrite();
    const start = (kind) =>
        mutation.mutateAsync({
            action: 'createSleep',
            values: {
                day: day.date,
                kind,
                start: new Date().toISOString(),
                end: null,
                ends_night: false,
            },
        });
    const active = day.sleeps.find((sleep) => !sleep.end);
    return (
        <>
            <Metrics value={day.metrics} />
            <p className="muted">
                {day.timezone} · расчёт на {clockTime(day.as_of, day.timezone)}
            </p>
            {day.issues.map((issue) => (
                <p key={issue} className="notice">
                    {issues[issue]}
                </p>
            ))}
            {!readOnly && (
                <>
                    <ScheduleChoice day={day} />
                    <div className="actions">
                        {!active && day.date === today(day.timezone) && (
                            <>
                                <ActionButton action={() => start('nap')}>Уснул днём</ActionButton>
                                <ActionButton action={() => start('night')}>Начать ночь</ActionButton>
                            </>
                        )}
                        <button type="button" onClick={() => setEditing(null)}>
                            Записать сон вручную
                        </button>
                    </div>
                </>
            )}
            {editing !== undefined && (
                <SleepForm
                    key={`${editing?.id || 'new'}-${day.date}`}
                    sleep={editing}
                    day={day}
                    close={() => setEditing(undefined)}
                />
            )}
            {day.previous_night && (
                <section className="card">
                    <h2>Предыдущая ночь</h2>
                    <p>Подъём: {clockTime(day.previous_night.end, day.timezone)}</p>
                    {!readOnly && (
                        <button type="button" onClick={() => setEditing(day.previous_night)}>
                            Исправить утреннюю границу
                        </button>
                    )}
                </section>
            )}
            {day.timeline.map((entry, index) => (
                <TimelineEntry
                    key={entry.id || `forecast-${index}`}
                    entry={entry}
                    day={day}
                    edit={setEditing}
                    readOnly={readOnly}
                />
            ))}
            <OrphanedNotes day={day} readOnly={readOnly} />
        </>
    );
}
DayContent.propTypes = { day: PropTypes.object.isRequired, readOnly: PropTypes.bool };

export function DayPage({ user, owner }) {
    const [params, setParams] = useSearchParams();
    const date = params.get('date') || today(user.timezone);
    const setDate = (value) => setParams({ date: value });
    const query = useRead({ action: owner ? 'adminDay' : 'day', key: date, parent: owner }, { refetchInterval: 60000 });
    return (
        <>
            <div className="day-picker">
                <button type="button" aria-label="Предыдущий день" onClick={() => setDate(dateShift(date, -1))}>
                    ‹
                </button>
                <label>
                    День дневника
                    <input
                        type="date"
                        value={date}
                        required
                        onChange={(event) => event.target.value && setDate(event.target.value)}
                    />
                </label>
                <button type="button" aria-label="Следующий день" onClick={() => setDate(dateShift(date, 1))}>
                    ›
                </button>
            </div>
            {!owner && <PreviousNight user={user} select={setDate} />}
            <Loading query={query}>
                {query.data && <DayContent key={date} day={query.data} readOnly={Boolean(owner)} />}
            </Loading>
        </>
    );
}
DayPage.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };

function IntervalControls({ entry, day, edit, sleep }) {
    const left =
        day.previous_night && day.previous_night.end === entry.start
            ? day.previous_night
            : day.sleeps.find((item) => item.end === entry.start);
    return (
        <div className="actions">
            {sleep && <SleepControls sleep={sleep} edit={edit} />}
            {entry.kind === 'awake' && left && (
                <button type="button" onClick={() => edit(left)}>
                    Исправить левую границу
                </button>
            )}
            {entry.kind === 'awake' &&
                day.sleeps
                    .filter((item) => item.start === entry.end)
                    .map((right) => (
                        <button type="button" key={right.id} onClick={() => edit(right)}>
                            Исправить правую границу
                        </button>
                    ))}
        </div>
    );
}
IntervalControls.propTypes = { ...TimelineEntry.propTypes, sleep: PropTypes.object };

function PreviousNight({ user, select }) {
    const yesterday = dateShift(today(user.timezone), -1);
    const previous = useRead({ action: 'day', key: yesterday }, { refetchInterval: 60000 });
    const active = previous.data?.sleeps.find((sleep) => !sleep.end);
    if (!active) return null;
    return (
        <section className="card ongoing">
            <p>Продолжается сон предыдущего дня.</p>
            <button type="button" onClick={() => select(yesterday)}>
                Открыть текущий сон
            </button>
        </section>
    );
}
PreviousNight.propTypes = { user: PropTypes.object.isRequired, select: PropTypes.func.isRequired };

function SleepControls({ sleep, edit }) {
    const mutation = useWrite();
    return (
        <>
            {!sleep.end && (
                <ActionButton
                    action={() =>
                        mutation.mutateAsync({
                            action: 'updateSleep',
                            key: sleep.id,
                            version: sleep.version,
                            values: { end: new Date().toISOString(), ends_night: sleep.kind === 'night' },
                        })
                    }
                >
                    {sleep.kind === 'night' ? 'Утренний подъём' : 'Проснулся'}
                </ActionButton>
            )}
            {
                <button type="button" onClick={() => edit(sleep)}>
                    {sleep.end ? 'Исправить сон' : 'Завершить / исправить'}
                </button>
            }
        </>
    );
}
SleepControls.propTypes = { sleep: PropTypes.object.isRequired, edit: PropTypes.func.isRequired };
