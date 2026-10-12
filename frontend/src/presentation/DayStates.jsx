import PropTypes from 'prop-types';
import { useState } from 'react';

import { DurationValue } from './DurationValue.jsx';
import { ActionButton } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button } from './Mobile.jsx';
import { SleepForm } from './SleepForm.jsx';
import { clockTime, dateShift } from './time.js';
import { useWrite } from './useApi.js';

export function WelcomeDay({ day }) {
    const [open, setOpen] = useState(false);
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
                <Button onClick={() => setOpen(true)}>
                    <Icon name="plus" />
                    Добавить ночной сон
                </Button>
            </div>
            {open && (
                <SleepForm day={{ ...day, date: dateShift(day.date, -1) }} kind="night" close={() => setOpen(false)} />
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
                <div className="hero-art" aria-hidden="true" />
                <h2>{waking ? 'Малыш бодрствует' : 'Малыш спит уже'}</h2>
                <div className="countdown">
                    <DurationValue seconds={nightSeconds(day, sleep, waking)} />
                </div>
                <p className="hero-detail">С {clockTime(waking?.start || sleep.start, day.timezone)}</p>
                <div className="settling-active">
                    <ActionButton
                        className="settling-without-sleep"
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
                </div>
            </section>
            <Button className="outline-button night-finish" onClick={() => setOpen(true)}>
                <Icon name="sun" />
                Завершить ночной сон
            </Button>
            <Button className="text-button" onClick={() => setOpen('waking')}>
                Указать время ночного бодрствования
            </Button>
            {open && (
                <SleepForm
                    sleep={open === 'waking' ? null : sleep}
                    day={day}
                    kind={open === 'waking' ? 'night_awake' : 'night'}
                    finish={open !== 'waking'}
                    close={() => setOpen(false)}
                />
            )}
        </>
    );
}
NightDay.propTypes = WelcomeDay.propTypes;

function nightSeconds(day, sleep, waking) {
    if (waking) return (Date.parse(day.as_of) - Date.parse(waking.start)) / 1000;
    return sleep.duration_seconds ?? (Date.parse(day.as_of) - Date.parse(sleep.start)) / 1000;
}
