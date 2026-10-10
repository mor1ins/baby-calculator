import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Card } from './Mobile.jsx';
import { PeriodForm } from './ReportActions.jsx';
import { dateShift, duration, today } from './time.js';
import { useRead } from './useApi.js';

function monthBounds(date) {
    const start = `${date.slice(0, 7)}-01`;
    const next = dateShift(start, 32).slice(0, 7) + '-01';
    return { start, end: dateShift(next, -1) };
}

export function History({ user, owner }) {
    const [exporting, setExporting] = useState(false);
    const [selected, setSelected] = useState(today(user.timezone));
    const { start, end } = monthBounds(selected);
    const query = useRead({
        action: owner ? 'adminHistory' : 'history',
        parent: owner,
        values: { from: start, to: end },
    });
    const navigate = useNavigate();
    const href = (date) => `${owner ? '/admin/' + owner : '/'}?date=${date}`;
    return (
        <>
            {!owner && (
                <div className="history-tools">
                    <button type="button" onClick={() => navigate('/statistics')}>
                        <Icon name="chart" />
                        Статистика
                    </button>
                    <button type="button" onClick={() => setExporting(true)}>
                        <Icon name="download" />
                        Экспорт CSV
                    </button>
                </div>
            )}
            {exporting && (
                <PeriodForm
                    period={{ from: start, to: end > today(user.timezone) ? today(user.timezone) : end }}
                    zone={user.timezone}
                    close={() => setExporting(false)}
                    exporting
                />
            )}
            <Card className="calendar-card">
                <div className="day-picker">
                    <button
                        type="button"
                        aria-label="Предыдущий месяц"
                        onClick={() => setSelected(dateShift(start, -1))}
                    >
                        ‹
                    </button>
                    <strong>
                        {new Intl.DateTimeFormat('ru', { month: 'long', year: 'numeric' }).format(
                            new Date(`${start}T12:00:00`),
                        )}
                    </strong>
                    <button type="button" aria-label="Следующий месяц" onClick={() => setSelected(dateShift(end, 1))}>
                        ›
                    </button>
                </div>
                <Calendar
                    start={start}
                    end={end}
                    selected={selected}
                    recorded={query.data?.items || []}
                    select={(date) => navigate(href(date))}
                />
            </Card>
            <div className="section-head">
                <h2>Записи по дням</h2>
                <span>Ваш дневник</span>
            </div>
            <Loading query={query}>
                {query.data?.items.length === 0 && <p className="muted">В этом периоде записей пока нет.</p>}
                {query.data?.items.map((day) => (
                    <Link key={day.date} className="history-row" to={href(day.date)} aria-label={day.date}>
                        <span className="date-tile">
                            <strong>{Number(day.date.slice(-2))}</strong>
                            {new Intl.DateTimeFormat('ru', { weekday: 'short' }).format(
                                new Date(`${day.date}T12:00:00`),
                            )}
                        </span>
                        <span className="history-copy">
                            <strong>{day.complete ? 'День завершён' : 'Есть неполные данные'}</strong>
                            <span className="muted">
                                Днём {duration(day.metrics.day_sleep_seconds)} · Ночью{' '}
                                {duration(day.metrics.night_sleep_seconds)}
                            </span>
                        </span>
                        <Icon name="next" />
                    </Link>
                ))}
            </Loading>
        </>
    );
}
History.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };

function Calendar({ start, end, selected, recorded, select }) {
    const offset = (new Date(`${start}T12:00:00`).getDay() + 6) % 7;
    const dates = Array.from({ length: Number(end.slice(-2)) }, (_, index) => dateShift(start, index));
    return (
        <>
            <div className="weekdays">
                {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((name) => (
                    <span key={name}>{name}</span>
                ))}
            </div>
            <div className="calendar">
                {Array.from({ length: offset }, (_, index) => (
                    <span key={`blank-${index}`} />
                ))}
                {dates.map((date) => (
                    <button
                        key={date}
                        type="button"
                        aria-label={`Открыть ${date}`}
                        aria-current={date === selected ? 'date' : undefined}
                        className={`${date === selected ? 'selected' : ''} ${recorded.some((day) => day.date === date) ? 'recorded' : ''}`}
                        onClick={() => select(date)}
                    >
                        {Number(date.slice(-2))}
                    </button>
                ))}
            </div>
        </>
    );
}
Calendar.propTypes = {
    start: PropTypes.string.isRequired,
    end: PropTypes.string.isRequired,
    selected: PropTypes.string.isRequired,
    recorded: PropTypes.array.isRequired,
    select: PropTypes.func.isRequired,
};
