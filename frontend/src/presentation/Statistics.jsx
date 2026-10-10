import { Segmented, SegmentedButton } from 'konsta/react';
import PropTypes from 'prop-types';
import { useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { ChildPhoto } from './Child.jsx';
import { ActionButton, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button, Card } from './Mobile.jsx';
import { PageHeading } from './PageHeading.jsx';
import { PeriodForm, periodLabel, ReportActions } from './ReportActions.jsx';
import { Changes, Comparison, Overview, Rhythm } from './ReportPanels.jsx';
import { dateShift, today } from './time.js';
import { useRead, useWrite } from './useApi.js';

function ReportContent({ report, readOnly = false }) {
    const [tab, setTab] = useState('overview');
    const Component = { overview: Overview, rhythm: Rhythm, compare: Comparison, changes: Changes }[tab];
    return (
        <>
            <Segmented
                strong
                rounded
                className="mobile-segmented insight-tabs"
                role="group"
                aria-label="Разделы статистики"
            >
                {[
                    ['overview', 'Обзор'],
                    ['rhythm', 'Ритм суток'],
                    ['compare', 'День → ночь'],
                    ['changes', 'Изменения'],
                ].map(([key, label]) => (
                    <SegmentedButton
                        key={key}
                        type="button"
                        active={tab === key}
                        aria-pressed={tab === key}
                        onClick={() => setTab(key)}
                    >
                        {label}
                    </SegmentedButton>
                ))}
            </Segmented>
            {report.rows.length || tab === 'changes' ? (
                <Component key={`${report.from}-${report.to}`} report={report} readOnly={readOnly} />
            ) : (
                <Card className="empty empty-report">
                    <h2>Пока нет записей</h2>
                    <p>Выберите другой период. Отсутствие записей не означает отсутствие сна.</p>
                </Card>
            )}
        </>
    );
}
ReportContent.propTypes = { report: PropTypes.object.isRequired, readOnly: PropTypes.bool };

export function Statistics({ user }) {
    const [params, setParams] = useSearchParams();
    const now = today(user.timezone);
    const period = { from: params.get('from') || dateShift(now, -7), to: params.get('to') || dateShift(now, -1) };
    const [panel, setPanel] = useState(null);
    const query = useRead({ action: 'report', values: period });
    const apply = (values) => setParams(values);
    const short = (value) =>
        new Date(value + 'T12:00:00Z').toLocaleDateString('ru', { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return (
        <>
            <PageHeading title="Статистика" description="Замечайте ритм, день за днём">
                <Button
                    className="icon-button"
                    aria-label="Действия со статистикой"
                    disabled={!query.data}
                    onClick={() => setPanel('actions')}
                >
                    <span aria-hidden="true">⋯</span>
                </Button>
            </PageHeading>
            <Card className="period-card">
                <span className="kicker">ПЕРИОД СТАТИСТИКИ</span>
                <button type="button" className="period-button" onClick={() => setPanel('period')}>
                    {short(period.from)} — {short(period.to)} · {period.to.slice(0, 4)} <Icon name="calendar" />
                </button>
                <div className="chips">
                    {[7, 30].map((days) => (
                        <Button
                            key={days}
                            className="period-preset"
                            aria-pressed={period.from === dateShift(now, -days) && period.to === dateShift(now, -1)}
                            onClick={() => apply({ from: dateShift(now, -days), to: dateShift(now, -1) })}
                        >
                            {days === 7 ? 'Последняя неделя' : '30 дней'}
                        </Button>
                    ))}
                    <Button className="period-preset" onClick={() => setPanel('period')}>
                        Свой период
                    </Button>
                </div>
                <p className="form-note">Даты циклов включительно · {user.timezone}</p>
            </Card>
            <Loading query={query}>{query.data && <ReportContent report={query.data} />}</Loading>
            {panel === 'period' && (
                <PeriodForm period={period} zone={user.timezone} apply={apply} close={() => setPanel(null)} />
            )}
            {panel === 'actions' && query.data && <ReportActions report={query.data} close={() => setPanel(null)} />}
        </>
    );
}
Statistics.propTypes = { user: PropTypes.object.isRequired };

export function PublicReport() {
    const { token } = useParams();
    const query = useRead({ action: 'publicReport', key: token });
    const mutation = useWrite();
    if (query.isError)
        return (
            <>
                <PageHeading title="Отчёт недоступен" description="Ссылка отозвана или не существует." />
                <p className="info-note">Попросите отправителя поделиться новой ссылкой.</p>
            </>
        );
    const report = query.data;
    return (
        <Loading query={query}>
            {report && (
                <>
                    <span className="badge">Публичный отчёт · только просмотр</span>
                    <section className="child-card">
                        <div className="child-photo">
                            <ChildPhoto child={report.child} />
                        </div>
                        <div>
                            <h2>{report.child.name}</h2>
                            <p>{report.child.age}</p>
                        </div>
                    </section>
                    <div className="public-export-actions">
                        <ActionButton
                            className="outline-button"
                            action={() =>
                                mutation.mutateAsync({ action: 'exportReport', values: { report, notes: false } })
                            }
                        >
                            <Icon name="download" />
                            Скачать CSV
                        </ActionButton>
                    </div>
                    <div className="public-report-heading">
                        <PageHeading title="Ритм сна" description={periodLabel(report.from, report.to)} />
                        <p className="subtle public-snapshot">
                            Снимок на {new Date(report.as_of).toLocaleString('ru', { timeZone: report.timezone })} ·{' '}
                            {report.timezone}
                        </p>
                    </div>
                    <ReportContent report={report} readOnly />
                </>
            )}
        </Loading>
    );
}
