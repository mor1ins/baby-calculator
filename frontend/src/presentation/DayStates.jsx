import PropTypes from 'prop-types';
import { useState } from 'react';

import { DurationValue } from './DurationValue.jsx';
import { FinishNight } from './FinishNight.jsx';
import { ActionButton } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button } from './Mobile.jsx';
import { SleepForm } from './SleepForm.jsx';
import { clockTime, dateShift } from './time.js';
import { useWrite } from './useApi.js';

export function WelcomeDay({ day }) {
    const [open, setOpen] = useState(null);
    return (
        <>
            <div className="empty welcome-card">
                <div className="empty-orbit">
                    <Icon name="sun" />
                </div>
                <h2>
                    У каждого дня
                    <br />
                    свой ритм
                </h2>
                <p>
                    Добавьте прошедший ночной сон.
                    <br />
                    По времени пробуждения мы построим
                    <br />
                    начало дня и прогноз.
                </p>
                <Button onClick={() => setOpen('night')}>
                    <Icon name="plus" />
                    Добавить ночной сон
                </Button>
                <Button className="text-button add-past" onClick={() => setOpen('event')}>
                    <Icon name="plus" />
                    Добавить событие
                </Button>
            </div>
            {open && (
                <SleepForm
                    day={open === 'night' ? { ...day, date: dateShift(day.date, -1) } : day}
                    kind={open === 'night' ? 'night' : 'nap'}
                    close={() => setOpen(null)}
                />
            )}
        </>
    );
}
WelcomeDay.propTypes = { day: PropTypes.object.isRequired };

export function NightDay({ day }) {
    const [open, setOpen] = useState(false);
    const mutation = useWrite();
    const sleep = day.sleeps.find((item) => item.kind === 'night' && !item.end);
    const waking = sleep.wakings?.find((item) => !item.end);
    return (
        <>
            <section className="hero night-hero">
                <div className="hero-top">
                    <span className="live-dot" />
                    Тихое время
                </div>
                <h2>{waking ? 'Малыш бодрствует' : 'Малыш спит уже'}</h2>
                <div className="countdown">
                    <DurationValue seconds={nightSeconds(day, sleep, waking)} />
                </div>
                <p className="hero-detail">С {clockTime(waking?.start || sleep.start, day.timezone)}</p>
                <div className="night-control">
                    <ActionButton
                        className="primary night-toggle"
                        action={() =>
                            mutation.mutateAsync({
                                action: waking ? 'updateNightWaking' : 'createNightWaking',
                                key: waking?.id,
                                version: waking?.version,
                                values: waking
                                    ? { start: waking.start, end: new Date().toISOString() }
                                    : { day: day.date, start: new Date().toISOString(), end: null },
                            })
                        }
                    >
                        {waking ? 'Снова уснул' : 'Ночное бодрствование'}
                    </ActionButton>
                    <Button className="primary night-rise" onClick={() => setOpen(true)}>
                        Проснулся
                    </Button>
                </div>
            </section>
            {open && <FinishNight sleep={sleep} day={day} close={() => setOpen(false)} />}
        </>
    );
}
NightDay.propTypes = WelcomeDay.propTypes;

function nightSeconds(day, sleep, waking) {
    if (waking) return (Date.parse(day.as_of) - Date.parse(waking.start)) / 1000;
    return sleep.duration_seconds ?? (Date.parse(day.as_of) - Date.parse(sleep.start)) / 1000;
}
