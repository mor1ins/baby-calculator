import PropTypes from 'prop-types';
import { Fragment, useState } from 'react';

import { ChangeEditor } from './DayContext.jsx';
import { ActionButton } from './Forms.jsx';
import { Button, Card, Section } from './Mobile.jsx';
import { rhythmScale } from './rhythmScale.js';
import { dateShift, duration } from './time.js';
import { useWrite } from './useApi.js';

export const reportDuration = (minutes) =>
    duration(minutes === null || minutes === undefined ? null : Math.round(minutes) * 60).replace('мин', 'м');
export const minuteTime = (value) =>
    value === null || value === undefined
        ? '—'
        : `${String(Math.floor(value / 60) % 24).padStart(2, '0')}:${String(Math.round(value % 60)).padStart(2, '0')}`;
export const shortDate = (value) => value.slice(8) + '.' + value.slice(5, 7);

export function Overview({ report }) {
    return (
        <>
            <p className="info-note averages-note">
                {report.complete_count} из {report.calendar_days} циклов завершены. Средние рассчитаны только по ним;
                неполные дни и дни без записей исключены.
            </p>
            <div className="insight-highlights">
                {[
                    ['lastWake', 'Перед ночью', 'среднее бодрствование'],
                    ['settling', 'Укладывание', 'в среднем до засыпания'],
                ].map(([key, label, hint]) => (
                    <article key={key}>
                        <span>{label}</span>
                        <strong>{reportDuration(report.highlights[key]?.mean)}</strong>
                        <small>{hint}</small>
                        <small>
                            Разброс: {reportDuration(report.highlights[key]?.min)} —{' '}
                            {reportDuration(report.highlights[key]?.max)}
                        </small>
                    </article>
                ))}
            </div>
            <div className="report-metrics">
                {[
                    ['total', 'Всего по записям', 'дневной сон + ночной интервал'],
                    ['nap', 'Дневной сон', 'в среднем за цикл'],
                    ['night', 'Ночной интервал', 'в среднем за цикл'],
                    ['awake', 'Бодрствование', 'в среднем за цикл'],
                    ['count', 'Дневных снов', 'в среднем за цикл'],
                ].map(([key, label, hint]) => (
                    <Card className="report-metric" key={key}>
                        <span>{label}</span>
                        <strong>
                            {key === 'count'
                                ? (report.averages.count?.toLocaleString('ru', { maximumFractionDigits: 1 }) ?? '—')
                                : reportDuration(report.averages[key])}
                        </strong>
                        <small>{hint}</small>
                    </Card>
                ))}
            </div>
        </>
    );
}
Overview.propTypes = { report: PropTypes.object.isRequired };

function RhythmBar({ start, end, kind, scale }) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
    const left = Math.max(0, ((start - scale.from) / (scale.to - scale.from)) * 100);
    const right = Math.min(100, ((end - scale.from) / (scale.to - scale.from)) * 100);
    if (right <= left) return null;
    const visibleLeft = kind === 'settling' ? Math.max(0, Math.min(left, right - 1.6)) : left;
    return <path className={kind} d={`M${visibleLeft} 0H${right}V10H${visibleLeft}Z`} />;
}
RhythmBar.propTypes = {
    start: PropTypes.number,
    end: PropTypes.number,
    kind: PropTypes.string.isRequired,
    scale: PropTypes.object.isRequired,
};

export function Rhythm({ report }) {
    const [selected, setSelected] = useState(null);
    const row = report.rows.find((item) => item.date === selected) || report.rows.at(-1);
    const scale = rhythmScale(report.rows);
    return (
        <>
            <Section title="Каждые сутки рядом">
                <span>
                    {minuteTime(scale.from)} → {minuteTime(scale.to)}
                </span>
            </Section>
            <p className="subtle">Выберите строку, чтобы рассмотреть день.</p>
            <Card className="rhythm-card">
                <div className="rhythm-legend">
                    <span className="nap-dot">Днём</span>
                    <span className="night-dot">Ночной сон</span>
                    <span className="settling-dot">Укладывание</span>
                </div>
                <div className="rhythm-axis">
                    {Array.from({ length: 5 }, (_, index) =>
                        minuteTime(Math.round(scale.from + ((scale.to - scale.from) * index) / 4)),
                    ).map((label, index) => (
                        <span key={index}>{label}</span>
                    ))}
                </div>
                <div className="rhythm-rows">
                    {Array.from({ length: report.calendar_days }, (_, index) => {
                        const date = dateShift(report.from, index),
                            item = report.rows.find((value) => value.date === date);
                        return (
                            <button
                                className="rhythm-row"
                                key={date}
                                type="button"
                                disabled={!item}
                                aria-pressed={date === row?.date}
                                aria-label={`Расписание ${shortDate(date)}`}
                                onClick={() => setSelected(date)}
                            >
                                <span>{shortDate(date)}</span>
                                <span className="rhythm-track">
                                    {item ? (
                                        <svg
                                            className="rhythm-svg"
                                            viewBox="0 0 100 10"
                                            preserveAspectRatio="none"
                                            aria-hidden="true"
                                        >
                                            <RhythmBar
                                                start={scale.from}
                                                end={item.morning}
                                                kind="night"
                                                scale={scale}
                                            />
                                            {item.naps.map(([start, end], position) => (
                                                <RhythmBar
                                                    key={position}
                                                    start={start}
                                                    end={end}
                                                    kind="nap"
                                                    scale={scale}
                                                />
                                            ))}
                                            <RhythmBar
                                                start={item.nightStart}
                                                end={item.nightEnd}
                                                kind="night"
                                                scale={scale}
                                            />
                                            <RhythmBar
                                                start={item.settleStart}
                                                end={item.nightStart}
                                                kind="settling"
                                                scale={scale}
                                            />
                                        </svg>
                                    ) : (
                                        <small>Нет записей</small>
                                    )}
                                </span>
                            </button>
                        );
                    })}
                </div>
                <p className="form-note">
                    Общие ночные участки по краям сокращены. Короткие укладывания увеличены для видимости.
                </p>
            </Card>
            {row && <DayDetail row={row} />}
        </>
    );
}
Rhythm.propTypes = Overview.propTypes;

function DayDetail({ row }) {
    return (
        <Card className="daily-detail compact-day">
            <h2>{shortDate(row.date)}</h2>
            <p className="day-boundaries">
                Подъём <strong>{minuteTime(row.morning)}</strong>
                <span aria-hidden="true">·</span>Ночь <strong>{minuteTime(row.nightStart)}</strong>
            </p>
            <DayCalculations row={row} />
            <ol className="daily-sequence">
                {row.timeline
                    .filter((entry) => entry.kind !== 'night')
                    .map((entry, index) => (
                        <li key={index} className={entry.kind === 'nap' ? 'nap-item' : ''}>
                            <span>
                                {entry.kind === 'nap' ? 'Дневной сон' : 'Бодрствование'}
                                <small>
                                    {new Date(entry.start).toLocaleTimeString('ru', {
                                        timeZone: row.timezone,
                                        hour: '2-digit',
                                        minute: '2-digit',
                                    })}
                                    –
                                    {entry.end
                                        ? new Date(entry.end).toLocaleTimeString('ru', {
                                              timeZone: row.timezone,
                                              hour: '2-digit',
                                              minute: '2-digit',
                                          })
                                        : 'сейчас'}
                                </small>
                            </span>
                            <strong>{reportDuration(entry.duration_seconds / 60)}</strong>
                        </li>
                    ))}
            </ol>
            {row.settleStart !== null && row.settleStart !== undefined && (
                <p className="subtle">
                    Укладывание {minuteTime(row.settleStart)}–{minuteTime(row.nightStart)}
                    {[row.settlingHelp, row.mood]
                        .filter(Boolean)
                        .map((detail) => ` · ${detail}`)
                        .join('')}
                </p>
            )}
            {row.context && <p className="info-note">{row.context}</p>}
        </Card>
    );
}
DayDetail.propTypes = { row: PropTypes.object.isRequired };

function DayCalculations({ row }) {
    return (
        <section className="compare-day" aria-label="Расчёты дня и следующей ночи">
            <h3>День → следующая ночь</h3>
            <dl>
                {[
                    ['Дневной сон', reportDuration(row.nap)],
                    ['Последнее бодрствование', reportDuration(row.lastWake)],
                    ['Укладывание', reportDuration(row.settling)],
                    ['Засыпание на ночь', minuteTime(row.nightStart)],
                    ['Ночной интервал', reportDuration(row.night)],
                ].map(([label, value]) => (
                    <div key={label}>
                        <dt>{label}</dt>
                        <dd>{value}</dd>
                    </div>
                ))}
            </dl>
        </section>
    );
}
DayCalculations.propTypes = DayDetail.propTypes;

export function Changes({ report, readOnly }) {
    const [editing, setEditing] = useState(false);
    const mutation = useWrite();
    return (
        <>
            <Section title="Что меняли в режиме" />
            {!readOnly && (
                <Button className="outline-button" onClick={() => setEditing(true)}>
                    Отметить изменение
                </Button>
            )}
            {editing && <ChangeEditor date={report.to} close={() => setEditing(false)} />}
            <p className="subtle">Изменения режима и сравнение соседних ночей.</p>
            {report.changes.length ? (
                report.changes.map((entry) => (
                    <Card className="change-card" key={entry.id}>
                        <span className="badge">{shortDate(entry.date)}</span>
                        <h2>{entry.text}</h2>
                        {!readOnly && (
                            <ActionButton
                                className="text-button"
                                confirm="Удалить отметку изменения?"
                                action={() =>
                                    mutation.mutateAsync({
                                        action: 'deleteChange',
                                        key: entry.id,
                                        version: entry.version,
                                    })
                                }
                            >
                                Удалить отметку
                            </ActionButton>
                        )}
                        <div className="change-comparison">
                            <span />
                            <strong>До · {entry.before_count} дн.</strong>
                            <strong>После · {entry.after_count} дн.</strong>
                            {[
                                ['Укладывание', 'settling'],
                                ['Перед ночью', 'lastWake'],
                            ].map(([label, key]) => (
                                <Fragment key={key}>
                                    <span>{label}</span>
                                    <b>{reportDuration(entry.before[key]?.mean)}</b>
                                    <b>{reportDuration(entry.after[key]?.mean)}</b>
                                </Fragment>
                            ))}
                        </div>
                    </Card>
                ))
            ) : (
                <Card>
                    <h2>Пока без отметок изменений</h2>
                    <p className="subtle">За выбранный период нет записей об изменениях режима.</p>
                </Card>
            )}
            <p className="info-note">
                Совпадение по времени не доказывает, что сон изменился именно из-за этого действия.
            </p>
        </>
    );
}
Changes.propTypes = { ...Overview.propTypes, readOnly: PropTypes.bool };
