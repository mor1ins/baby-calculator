import PropTypes from 'prop-types';
import { useState } from 'react';

import { DurationValue } from './DurationValue.jsx';
import { Icon } from './Icon.jsx';
import { Button } from './Mobile.jsx';
import { SleepForm } from './SleepForm.jsx';
import { clockTime, dateShift } from './time.js';

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
    const sleep = day.sleeps.find((item) => item.kind === 'night' && !item.end);
    return (
        <>
            <section className="hero night-hero">
                <div className="hero-top">
                    <span className="live-dot" />
                    Тихое время
                </div>
                <div className="hero-art" aria-hidden="true" />
                <h2>Малыш спит уже</h2>
                <div className="countdown">
                    <DurationValue seconds={(Date.parse(day.as_of) - Date.parse(sleep.start)) / 1000} />
                </div>
                <p className="hero-detail">С {clockTime(sleep.start, day.timezone)}</p>
            </section>
            <Button className="outline-button night-finish" onClick={() => setOpen(true)}>
                <Icon name="sun" />
                Завершить ночной сон
            </Button>
            <p className="form-note">Нажмите, когда сон закончился, например при утреннем подъёме.</p>
            {open && <SleepForm sleep={sleep} day={day} finish close={() => setOpen(false)} />}
        </>
    );
}
NightDay.propTypes = WelcomeDay.propTypes;
