import PropTypes from 'prop-types';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { ChildCard } from './Child.jsx';
import { CurrentInterval } from './CurrentInterval.jsx';
import { DayContext, SettlingNotes } from './DayContext.jsx';
import { NightDay, WelcomeDay } from './DayStates.jsx';
import { DurationValue } from './DurationValue.jsx';
import { ActionButton, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { intervalNames } from './labels.js';
import { Button } from './Mobile.jsx';
import { Note, OrphanedNotes } from './Notes.jsx';
import { PageHeading } from './PageHeading.jsx';
import { PlanCard } from './Schedules.jsx';
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

export function Metrics({ value, schedule }) {
    return (
        <div className="metrics">
            {[
                ['day_sleep_seconds', 'Дневной сон', 'sun'],
                ['night_sleep_seconds', 'Ночной сон', 'moon'],
                ['day_awake_seconds', 'Бодрствование', 'clock'],
            ].map(([key, label, icon]) => (
                <div className="metric" key={key}>
                    <Icon name={icon} />
                    <strong>
                        <DurationValue seconds={value[key]} />
                    </strong>
                    <label>{label}</label>
                    <p className="subtle">{metricDetail(key, value, schedule)}</p>
                </div>
            ))}
        </div>
    );
}
Metrics.propTypes = { value: PropTypes.object.isRequired, schedule: PropTypes.object };

function ScheduleChoice({ day }) {
    const [open, setOpen] = useState(false);
    const schedules = useRead({ action: 'schedules' });
    const mutation = useWrite();
    const apply = async (schedule_id) => {
        await mutation.mutateAsync({
            action: 'setSchedule',
            key: day.date,
            version: day.version,
            values: { schedule_id },
        });
        setOpen(false);
    };
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
                    <Loading query={schedules}>
                        {schedules.data?.items
                            .filter((item) => !item.archived)
                            .map((item) => (
                                <PlanCard key={item.id} schedule={item} selected={day.schedule?.source_id === item.id}>
                                    <ActionButton action={() => apply(item.id)}>Выбрать этот график</ActionButton>
                                </PlanCard>
                            ))}
                        <ActionButton className="text-button" action={() => apply(null)}>
                            Без графика
                        </ActionButton>
                    </Loading>
                </Sheet>
            )}
        </>
    );
}
ScheduleChoice.propTypes = { day: PropTypes.object.isRequired };

function TimelineEntry({ entry, day, edit, readOnly }) {
    const sleep = day.sleeps.find((item) => item.id === entry.sleep_id);
    return (
        <section
            className={`time-row ${entry.kind} ${entry.status === 'forecast' ? 'forecast' : ''} ${entry.kind === 'awake' ? '' : 'sleep'}`}
        >
            <time className="time-label">{clockTime(entry.start, day.timezone)}</time>
            <div className="time-track" aria-hidden="true">
                <span className="time-dot" />
            </div>
            <div className="interval">
                <div className="interval-top">
                    <h3>
                        {intervalNames[entry.kind]}
                        {entry.kind !== 'night' &&
                            ` ${day.timeline.filter((item) => item.kind === entry.kind).indexOf(entry) + 1}`}
                        {entry.status === 'ongoing' && <span className="now-tag">сейчас</span>}
                    </h3>
                    <span className="duration">{duration(entry.duration_seconds).replace('мин', 'м')}</span>
                </div>
                <p className="muted interval-range">
                    {clockTime(entry.start, day.timezone)} — {entry.end ? clockTime(entry.end, day.timezone) : 'сейчас'}
                    {entry.status === 'forecast' && ' · прогноз'}
                </p>
                {entry.status !== 'forecast' && (
                    <>
                        <Note interval={entry} readOnly={readOnly} />
                        {!readOnly && <IntervalControls entry={entry} day={day} edit={edit} sleep={sleep} />}
                        <SettlingNotes entry={entry} day={day} />
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

function DayContent({ day, owner }) {
    const readOnly = Boolean(owner);
    const [editing, setEditing] = useState(undefined);
    if (!readOnly && !day.previous_night && !day.sleeps.length) return <WelcomeDay day={day} />;
    return (
        <>
            <DayActions day={day} readOnly={readOnly} edit={setEditing} />
            <div className="section-head">
                <h2>Уже сегодня</h2>
                <span>На {clockTime(day.as_of, day.timezone)}</span>
            </div>
            <Metrics value={day.metrics} schedule={day.schedule} />
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
            <div className="section-head">
                <h2>Лента дня</h2>
                <div className="legend">
                    <span>
                        <i />
                        Факт
                    </span>
                    <span>
                        <i className="future" />
                        Прогноз
                    </span>
                </div>
            </div>
            <div className="timeline">
                {day.previous_night && (
                    <CompletedNight key={day.previous_night.id} day={day} owner={owner} edit={setEditing} />
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
            </div>
            <p className="info-note">
                <Icon name="info" />
                Бодрствование считается между снами. Прогноз меняется вместе с вашим днём.
            </p>
            <DayContext day={day} readOnly={readOnly} />
            <OrphanedNotes day={day} readOnly={readOnly} />
        </>
    );
}
DayContent.propTypes = { day: PropTypes.object.isRequired, owner: PropTypes.string };

function CompletedNight({ day }) {
    const night = day.previous_night;
    return (
        <div className="previous-night-context">
            <span className="kicker">ПРЕДЫДУЩАЯ НОЧЬ · {night.day}</span>
            <p>
                {clockTime(night.start, day.timezone)} — {clockTime(night.end, day.timezone)} ·{' '}
                {duration((Date.parse(night.end) - Date.parse(night.start)) / 1000)}
            </p>
            <p className="subtle">Завершение этой ночи задаёт начало дня. В сегодняшние итоги не входит.</p>
        </div>
    );
}
CompletedNight.propTypes = { day: PropTypes.object.isRequired };

export function DayPage({ user, owner }) {
    const [params, setParams] = useSearchParams();
    const date = params.get('date') || today(user.timezone);
    const setDate = (value) => setParams({ date: value });
    const [calendar, setCalendar] = useState(false);
    const query = useRead({ action: owner ? 'adminDay' : 'day', key: date, parent: owner }, { refetchInterval: 60000 });
    return (
        <>
            <PageHeading
                title={dayTitle(query.data, date, user.timezone)}
                description={new Intl.DateTimeFormat('ru', { weekday: 'long', day: 'numeric', month: 'long' }).format(
                    new Date(`${date}T12:00:00`),
                )}
            >
                <Button className="icon-button" aria-label="Выбрать дату" onClick={() => setCalendar(true)}>
                    <Icon name="calendar" />
                </Button>
            </PageHeading>
            {!owner &&
                query.data?.previous_night &&
                !query.data.sleeps.some((item) => item.kind === 'night' && !item.end) && (
                    <ChildCard zone={user.timezone} />
                )}
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
            <Loading query={query}>{query.data && <DayContent key={date} day={query.data} owner={owner} />}</Loading>
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
            <button className="interval-edit" type="button" onClick={() => setOpen(true)}>
                <Icon name="sliders" />
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
        <button className="interval-edit" type="button" onClick={() => edit(sleep)}>
            <Icon name="sliders" />
            {sleep.end ? 'Изменить интервал' : 'Завершить / исправить'}
        </button>
    );
}
SleepControls.propTypes = { sleep: PropTypes.object.isRequired, edit: PropTypes.func.isRequired };

function DayActions({ day, readOnly, edit }) {
    const mutation = useWrite();
    const start = (kind, minutes = 0) =>
        mutation.mutateAsync({
            action: 'createSleep',
            values: {
                day: day.date,
                kind,
                start: new Date(Date.now() - minutes * 60000).toISOString(),
                end: null,
            },
        });
    const active = day.sleeps.find((sleep) => !sleep.end);
    if (readOnly) return <p className="notice">График: {day.schedule?.name || 'не выбран'}</p>;
    if (active?.kind === 'night') return <NightDay day={day} />;
    return (
        <>
            <ScheduleChoice day={day} />

            {(active || day.date === today(day.timezone)) && (
                <CurrentInterval day={day} active={active} start={start} />
            )}

            {
                <Button type="button" className="text-button add-past" onClick={() => edit(null)}>
                    <Icon name="plus" />
                    Добавить прошедший сон
                </Button>
            }
        </>
    );
}
DayActions.propTypes = { day: PropTypes.object.isRequired, readOnly: PropTypes.bool, edit: PropTypes.func.isRequired };

function dayTitle(day, date, zone) {
    if (day?.sleeps.some((item) => item.kind === 'night' && !item.end)) return 'Ночной сон';
    if (day && !day.previous_night && !day.sleeps.length) return 'Новый день';
    return date === today(zone) ? 'Сегодня' : 'День дневника';
}

function metricDetail(key, value, schedule) {
    if (key === 'night_sleep_seconds') return value[key] === null ? 'ещё впереди' : 'по записям';
    if (key === 'day_sleep_seconds' && schedule)
        return (
            'из ' +
            duration(
                schedule.segments
                    .filter((part) => part.kind === 'nap')
                    .reduce((sum, part) => sum + part.duration_minutes, 0) * 60,
            ).replace('мин', 'м')
        );
    return 'с текущим периодом';
}
