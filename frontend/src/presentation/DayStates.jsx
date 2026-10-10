import PropTypes from 'prop-types';
import { useState } from 'react';

import { DurationValue } from './DurationValue.jsx';
import { Icon } from './Icon.jsx';
import { Button, Card, Section } from './Mobile.jsx';
import { Note } from './Notes.jsx';
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
    const interval = day.timeline.find((item) => item.sleep_id === sleep.id);
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
            <Section title="Заметка о ночи" />
            {interval && <Note interval={interval} />}
            <Card>
                <h3>Ночь относится к {day.date}</h3>
                <p className="subtle">
                    Утром она останется в итогах прошедшего дня. К дневному бодрствованию ночные пробуждения не
                    прибавляются.
                </p>
            </Card>
            {open && <SleepForm sleep={sleep} day={day} finish close={() => setOpen(false)} />}
        </>
    );
}
NightDay.propTypes = WelcomeDay.propTypes;
