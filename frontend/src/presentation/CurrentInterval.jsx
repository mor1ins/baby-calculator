import PropTypes from 'prop-types';
import { useState } from 'react';

import { DurationValue } from './DurationValue.jsx';
import { ActionButton } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button } from './Mobile.jsx';
import { StartSleep } from './StartSleep.jsx';
import { clockTime, duration } from './time.js';
import { useWrite } from './useApi.js';

export function CurrentInterval({ day, active, start }) {
    const mutation = useWrite();
    const [picker, setPicker] = useState(false);
    const current = day.timeline.find((entry) => entry.status === 'ongoing');
    const nextKind = day.timeline.find((entry) => entry.status === 'forecast')?.kind === 'night' ? 'night' : 'nap';
    const attempt = day.settling?.find((item) => !item.end_at);
    const finish = () =>
        mutation.mutateAsync({
            action: 'updateSleep',
            key: active.id,
            version: active.version,
            values: { end: new Date().toISOString() },
        });
    return (
        <section className="hero" aria-label="Текущий промежуток">
            <HeroForecast day={day} current={current} sleeping={Boolean(active)} attempt={attempt} />
            {active ? (
                <ActionButton action={finish}>
                    <Icon name="sun" />
                    {active.kind === 'night' ? 'Утренний подъём' : 'Проснулся'}
                </ActionButton>
            ) : (
                <SettlingControls day={day} attempt={attempt} sleep={() => setPicker(true)} />
            )}
            {picker && (
                <StartSleep
                    zone={day.timezone}
                    close={() => setPicker(false)}
                    start={(minutes) => start(nextKind, minutes)}
                />
            )}
        </section>
    );
}
CurrentInterval.propTypes = {
    day: PropTypes.object.isRequired,
    active: PropTypes.object,
    start: PropTypes.func.isRequired,
};

function SettlingControls({ day, attempt, sleep }) {
    const mutation = useWrite();
    const action = (name) =>
        mutation.mutateAsync({ action: name, key: attempt?.id, version: attempt?.version, values: { day: day.date } });
    if (!attempt)
        return (
            <>
                <ActionButton action={() => action('startSettling')}>
                    <Icon name="clock" />
                    Начать укладывание
                </ActionButton>
                <button type="button" className="settling-start" onClick={sleep}>
                    <Icon name="moon" />
                    Уже уснул
                </button>
            </>
        );
    return (
        <>
            <Button onClick={sleep}>
                <Icon name="moon" />
                Уснул
            </Button>
            <div className="settling-active">
                <ActionButton className="settling-without-sleep" action={() => action('finishSettling')}>
                    Завершить без сна
                </ActionButton>
                <ActionButton className="settling-without-sleep" action={() => action('cancelSettling')}>
                    Отменить без сохранения
                </ActionButton>
            </div>
        </>
    );
}
SettlingControls.propTypes = {
    day: PropTypes.object.isRequired,
    attempt: PropTypes.object,
    sleep: PropTypes.func.isRequired,
};

function HeroForecast({ day, current, sleeping, attempt }) {
    const remaining = current?.expected_end ? (Date.parse(current.expected_end) - Date.parse(day.as_of)) / 1000 : null;
    const title = forecastTitle(attempt, remaining, sleeping);
    const elapsed = attempt ? (Date.parse(day.as_of) - Date.parse(attempt.start_at)) / 1000 : remaining;
    return (
        <>
            <div className="hero-top">
                <span className="live-dot" />
                {sleeping ? 'Малыш спит' : attempt ? 'Укладываем · малыш бодрствует' : 'Малыш бодрствует'} ·{' '}
                {duration(current?.duration_seconds)}
            </div>
            <div className="hero-art" aria-hidden="true" />
            <h2>{title}</h2>
            <div className="countdown">
                <DurationValue seconds={elapsed === null ? null : Math.abs(elapsed)} />
            </div>
            <div className="hero-detail">{forecastDetail(attempt, current, day.timezone)}</div>
        </>
    );
}
HeroForecast.propTypes = {
    day: PropTypes.object.isRequired,
    current: PropTypes.object,
    sleeping: PropTypes.bool.isRequired,
    attempt: PropTypes.object,
};

function forecastTitle(attempt, remaining, sleeping) {
    if (attempt) return 'Укладывание длится';
    if (remaining < 0) return 'Дольше графика на';
    return sleeping ? 'До пробуждения' : 'До следующего сна';
}
function forecastDetail(attempt, current, zone) {
    if (attempt) return `Начали в ${clockTime(attempt.start_at, zone)} · входит в бодрствование`;
    return current?.expected_end
        ? `Ориентир — ${clockTime(current.expected_end, zone)} · по графику дня`
        : 'Для прогноза нужны график и утренняя граница';
}
