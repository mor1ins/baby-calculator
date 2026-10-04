import PropTypes from 'prop-types';

import { DurationValue } from './DurationValue.jsx';
import { ActionButton } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { clockTime, duration } from './time.js';
import { useWrite } from './useApi.js';

export function CurrentInterval({ day, active, start }) {
    const mutation = useWrite();
    const current = day.timeline.find((entry) => entry.status === 'ongoing');
    const nextKind = day.timeline.find((entry) => entry.status === 'forecast')?.kind === 'night' ? 'night' : 'nap';
    const finish = () =>
        mutation.mutateAsync({
            action: 'updateSleep',
            key: active.id,
            version: active.version,
            values: { end: new Date().toISOString(), ends_night: active.kind === 'night' },
        });
    return (
        <section className="hero" aria-label="Текущий промежуток">
            <HeroForecast day={day} current={current} sleeping={Boolean(active)} />
            <ActionButton action={active ? finish : () => start(nextKind)}>
                <Icon name={active ? 'sun' : 'moon'} />
                {active ? (active.kind === 'night' ? 'Утренний подъём' : 'Проснулся') : 'Уснул'}
            </ActionButton>
        </section>
    );
}
CurrentInterval.propTypes = {
    day: PropTypes.object.isRequired,
    active: PropTypes.object,
    start: PropTypes.func.isRequired,
};

function HeroForecast({ day, current, sleeping }) {
    const remaining = current?.expected_end ? (Date.parse(current.expected_end) - Date.parse(day.as_of)) / 1000 : null;
    const elapsed = current?.duration_seconds;
    const planned = remaining === null ? null : elapsed + remaining;
    const title = remaining < 0 ? 'Дольше графика на' : sleeping ? 'До пробуждения' : 'До следующего сна';
    return (
        <>
            <p className="hero-top">
                <span className="live-dot" />
                {sleeping ? 'Малыш спит' : 'Малыш бодрствует'} · {duration(elapsed)}
            </p>
            <div className="hero-art" aria-hidden="true" />
            <h2>{title}</h2>
            <div className="countdown">
                <DurationValue seconds={remaining === null ? null : Math.abs(remaining)} />
            </div>
            <ForecastDetail day={day} current={current} planned={planned} />
        </>
    );
}
HeroForecast.propTypes = {
    day: PropTypes.object.isRequired,
    current: PropTypes.object,
    sleeping: PropTypes.bool.isRequired,
};

function ForecastDetail({ day, current, planned }) {
    return (
        <>
            <p className="hero-detail">
                {current?.expected_end
                    ? `Ориентир — ${clockTime(current.expected_end, day.timezone)} · по графику дня`
                    : 'Для прогноза нужны график и утренняя граница'}
            </p>
            {planned > 0 && (
                <progress
                    max={planned}
                    value={Math.min(current.duration_seconds, planned)}
                    aria-label="Прошло от планового промежутка"
                />
            )}
            <div className="progress-label">
                <span>{current && `С ${clockTime(current.start, day.timezone)}`}</span>
                <span>{planned > 0 && `План ${duration(planned)}`}</span>
            </div>
        </>
    );
}
ForecastDetail.propTypes = { day: PropTypes.object.isRequired, current: PropTypes.object, planned: PropTypes.number };
