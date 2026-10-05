import PropTypes from 'prop-types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { CurrentInterval } from './CurrentInterval.jsx';
import { DurationValue } from './DurationValue.jsx';
import { Form, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { intervalNames } from './labels.js';
import { NightEvents } from './NightEvents.jsx';
import { Note, OrphanedNotes } from './Notes.jsx';
import { Sheet } from './Sheet.jsx';
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
                ['day_sleep_seconds', 'Дневной сон', 'sun'],
                ['night_sleep_seconds', 'Ночной сон', 'moon'],
                ['day_awake_seconds', 'Бодрствование', 'clock'],
            ].map(([key, label, icon]) => (
                <div key={key}>
                    <Icon name={icon} />
                    <strong>
                        <DurationValue seconds={value[key]} />
                    </strong>
                    <span>{label}</span>
                </div>
            ))}
        </div>
    );
}
Metrics.propTypes = { value: PropTypes.object.isRequired };

function ScheduleChoice({ day }) {
    const [open, setOpen] = useState(false);
    const schedules = useRead({ action: 'schedules' });
    const mutation = useWrite();
    return (
        <>
            <button type="button" className="schedule-strip" onClick={() => setOpen(true)}>
                <Icon name="sliders" />
                <span>
                    График дня<strong>{day.schedule?.name || 'не выбран'}</strong>
                </span>
                <Icon name="next" />
            </button>
            {open && (
                <Sheet title="График дня" close={() => setOpen(false)}>
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
                        submit={async ({ schedule_id }) => {
                            await mutation.mutateAsync({
                                action: 'setSchedule',
                                key: day.date,
                                version: day.version,
                                values: { schedule_id: schedule_id || null },
                            });
                            setOpen(false);
                        }}
                    />
                </Sheet>
            )}
        </>
    );
}
ScheduleChoice.propTypes = { day: PropTypes.object.isRequired };

function TimelineEntry({ entry, day, edit, readOnly }) {
    const sleep = day.sleeps.find((item) => item.id === entry.sleep_id);
    return (
        <section className={`timeline-entry ${entry.status} ${entry.kind}`}>
            <time className="time-label">{clockTime(entry.start, day.timezone)}</time>
            <div className="time-track" aria-hidden="true">
                <span />
            </div>
            <div className="interval">
                <div className="interval-top">
                    <h3>{intervalNames[entry.kind]}</h3>
                    <strong>{duration(entry.duration_seconds)}</strong>
                </div>
                <p className="muted interval-range">
                    {clockTime(entry.start, day.timezone)} — {entry.end ? clockTime(entry.end, day.timezone) : 'сейчас'}
                    <IntervalStatus status={entry.status} />
                </p>
                {entry.status !== 'forecast' && (
                    <>
                        {!readOnly && <IntervalControls entry={entry} day={day} edit={edit} sleep={sleep} />}
                        <Note interval={entry} readOnly={readOnly} />
                        {sleep?.kind === 'night' && (sleep.end || readOnly) && (
                            <NightEvents sleep={sleep} zone={day.timezone} readOnly={readOnly} />
                        )}
                    </>
                )}
            </div>
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
    return (
        <>
            <DayActions day={day} readOnly={readOnly} edit={setEditing} />
            <div className="section-head">
                <h2>День в цифрах</h2>
                <span>На {clockTime(day.as_of, day.timezone)}</span>
            </div>
            <Metrics value={day.metrics} />
            {day.issues
                .filter((issue) => issue !== 'missing_night_end')
                .map((issue) => (
                    <p key={issue} className="notice">
                        {issues[issue]}
                    </p>
                ))}
            {editing !== undefined && (
                <SleepForm
                    key={`${editing?.id || 'new'}-${day.date}`}
                    sleep={editing}
                    day={day}
                    close={() => setEditing(undefined)}
                />
            )}
            {day.previous_night && (
                <details className="previous-night">
                    <summary>Предыдущая ночь · подъём {clockTime(day.previous_night.end, day.timezone)}</summary>
                    <p>Подъём: {clockTime(day.previous_night.end, day.timezone)}</p>
                    {!readOnly && (
                        <button type="button" onClick={() => setEditing(day.previous_night)}>
                            Исправить утреннюю границу
                        </button>
                    )}
                </details>
            )}
            <div className="section-head">
                <h2>Линия дня</h2>
                <span>Факт и прогноз</span>
            </div>
            <div className="timeline">
                {day.timeline.map((entry, index) => (
                    <TimelineEntry
                        key={entry.id || `forecast-${index}`}
                        entry={entry}
                        day={day}
                        edit={setEditing}
                        readOnly={readOnly}
                    />
                ))}
            </div>
            <OrphanedNotes day={day} readOnly={readOnly} />
        </>
    );
}
DayContent.propTypes = { day: PropTypes.object.isRequired, readOnly: PropTypes.bool };

export function DayPage({ user, owner }) {
    const [params, setParams] = useSearchParams();
    const date = params.get('date') || today(user.timezone);
    const setDate = (value) => setParams({ date: value });
    const [calendar, setCalendar] = useState(false);
    const query = useRead({ action: owner ? 'adminDay' : 'day', key: date, parent: owner }, { refetchInterval: 60000 });
    return (
        <>
            <div className="day-date">
                <p>
                    {new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(
                        new Date(`${date}T12:00:00`),
                    )}
                </p>
                <button
                    type="button"
                    className="icon-button"
                    aria-label="Выбрать дату"
                    onClick={() => setCalendar(true)}
                >
                    <Icon name="calendar" />
                </button>
            </div>
            {calendar && (
                <Sheet title="День дневника" close={() => setCalendar(false)}>
                    <label>
                        День дневника
                        <input
                            type="date"
                            value={date}
                            required
                            onChange={(event) => {
                                if (event.target.value) {
                                    setDate(event.target.value);
                                    setCalendar(false);
                                }
                            }}
                        />
                    </label>
                </Sheet>
            )}
            {!owner && <PreviousNight user={user} select={setDate} />}
            <Loading query={query}>
                {query.data && <DayContent key={date} day={query.data} readOnly={Boolean(owner)} />}
            </Loading>
        </>
    );
}
DayPage.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };

function IntervalControls({ entry, day, edit, sleep }) {
    return (
        <div className="actions">
            {sleep && <SleepControls sleep={sleep} edit={edit} />}
            {entry.kind === 'awake' && <WakeBoundaries entry={entry} day={day} edit={edit} />}
        </div>
    );
}
IntervalControls.propTypes = { ...TimelineEntry.propTypes, sleep: PropTypes.object };

function WakeBoundaries({ entry, day, edit }) {
    const [open, setOpen] = useState(false);
    const left =
        day.previous_night?.end === entry.start
            ? day.previous_night
            : day.sleeps.find((item) => item.end === entry.start);
    const right = day.sleeps.find((item) => item.start === entry.end);
    const choose = (sleep) => {
        setOpen(false);
        edit(sleep);
    };
    if (!left && !right) return null;
    return (
        <>
            <button type="button" onClick={() => setOpen(true)}>
                Исправить границы
            </button>
            {open && (
                <Sheet title="Исправить бодрствование" close={() => setOpen(false)}>
                    <p className="muted">
                        Бодрствование считается между снами. Исправьте время соседнего сна — длительность пересчитается
                        автоматически.
                    </p>
                    <div className="form-stack">
                        {left && (
                            <button type="button" onClick={() => choose(left)}>
                                Окончание предыдущего сна · {clockTime(left.end, day.timezone)}
                            </button>
                        )}
                        {right && (
                            <button type="button" onClick={() => choose(right)}>
                                Начало следующего сна · {clockTime(right.start, day.timezone)}
                            </button>
                        )}
                    </div>
                </Sheet>
            )}
        </>
    );
}
WakeBoundaries.propTypes = {
    entry: PropTypes.object.isRequired,
    day: PropTypes.object.isRequired,
    edit: PropTypes.func.isRequired,
};

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
    return (
        <button type="button" onClick={() => edit(sleep)}>
            {sleep.end ? 'Исправить сон' : 'Завершить / исправить'}
        </button>
    );
}
SleepControls.propTypes = { sleep: PropTypes.object.isRequired, edit: PropTypes.func.isRequired };

function DayActions({ day, readOnly, edit }) {
    const mutation = useWrite();
    const start = (kind) =>
        mutation.mutateAsync({
            action: 'createSleep',
            values: {
                day: day.date,
                kind,
                start: new Date().toISOString(),
                end: null,
            },
        });
    const active = day.sleeps.find((sleep) => !sleep.end);
    if (readOnly) return <p className="notice">График: {day.schedule?.name || 'не выбран'}</p>;
    return (
        <>
            <ScheduleChoice day={day} />

            {(active || day.date === today(day.timezone)) && (
                <CurrentInterval day={day} active={active} start={start} />
            )}
            {active?.kind === 'night' && <NightEvents sleep={active} zone={day.timezone} />}
            {
                <button type="button" className="text-button add-past" onClick={() => edit(null)}>
                    <Icon name="plus" />
                    Записать сон вручную
                </button>
            }
        </>
    );
}
DayActions.propTypes = { ...DayContent.propTypes, edit: PropTypes.func.isRequired };

function IntervalStatus({ status }) {
    if (status === 'actual') return null;
    return <span className="status-tag">{status === 'forecast' ? 'прогноз' : 'сейчас'}</span>;
}
IntervalStatus.propTypes = { status: PropTypes.string.isRequired };
