import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton, Form, Loading } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button, Setting } from './Mobile.jsx';
import { Sheet } from './Sheet.jsx';
import { today } from './time.js';
import { useRead, useWrite } from './useApi.js';

export const periodLabel = (from, to) =>
    `${from.split('-').reverse().join('.')} — ${to.split('-').reverse().join('.')}`;

export function PeriodForm({ period, zone, close, apply, exporting = false }) {
    const mutation = useWrite();
    const [notes, setNotes] = useState(false);
    return (
        <Sheet title={exporting ? 'Экспорт данных' : 'Выбрать период'} close={close}>
            <p className="subtle">Даты циклов включительно · {zone}</p>
            <Form
                fields={[
                    { name: 'from', label: 'С', type: 'date', required: true, max: today(zone) },
                    { name: 'to', label: 'По', type: 'date', required: true, max: today(zone) },
                ]}
                initial={period}
                label={exporting ? 'Скачать CSV' : 'Применить период'}
                submit={async (values) => {
                    if (values.from > values.to) throw new Error('Начало периода должно быть не позже окончания');
                    if (exporting)
                        await mutation.mutateAsync({ action: 'exportReport', values: { period: values, notes } });
                    else apply(values);
                    close();
                }}
            >
                {exporting && (
                    <>
                        <p className="info-note">
                            CSV: фактические интервалы сна. Открытый сон — без окончания и длительности. Прогнозы не
                            выгружаются.
                        </p>
                        <label className="export-check">
                            <input
                                type="checkbox"
                                checked={notes}
                                onChange={(event) => setNotes(event.target.checked)}
                            />
                            Включить заметки
                        </label>
                        <p className="form-note">Заметки могут содержать личную информацию. UTF-8 · разделитель «;».</p>
                    </>
                )}
            </Form>
        </Sheet>
    );
}
PeriodForm.propTypes = {
    period: PropTypes.object.isRequired,
    zone: PropTypes.string.isRequired,
    close: PropTypes.func.isRequired,
    apply: PropTypes.func,
    exporting: PropTypes.bool,
};

export function ReportActions({ report, close }) {
    const [mode, setMode] = useState('menu');
    if (mode === 'export') return <PeriodForm period={report} zone={report.timezone} close={close} exporting />;
    if (mode === 'share') return <ShareReport report={report} close={close} />;
    return (
        <Sheet title="Действия со статистикой" close={close}>
            <Setting
                title="Скачать CSV"
                subtitle="Экспорт записей за период"
                icon="download"
                onClick={() => setMode('export')}
            />
            <Setting
                title="Поделиться"
                subtitle="Публичный отчёт по ссылке"
                icon="share"
                onClick={() => setMode('share')}
            />
        </Sheet>
    );
}
ReportActions.propTypes = { report: PropTypes.object.isRequired, close: PropTypes.func.isRequired };

function ShareReport({ report, close }) {
    const mutation = useWrite();
    const shares = useRead({ action: 'shares' });
    const [created, setCreated] = useState(null);
    const [copied, setCopied] = useState(false);
    const revoke = async (id) => {
        await mutation.mutateAsync({ action: 'revokeShare', key: id });
        if (created?.id === id) setCreated(null);
    };
    return (
        <Sheet title={created ? 'Ссылка на статистику' : 'Поделиться статистикой'} close={close}>
            <div className="share-panel">
                <p className="share-period">{periodLabel(report.from, report.to)}</p>
                {created ? (
                    <>
                        <div className="share-address">
                            <a id="share-url" href={`/s/${created.token}`}>
                                Открыть публичный отчёт
                            </a>
                            <ActionButton
                                className="icon-button share-copy"
                                action={async () => {
                                    await mutation.mutateAsync({ action: 'copyShare', key: created.token });
                                    setCopied(true);
                                }}
                            >
                                <Icon name="copy" />
                                <span className="sr-only">Скопировать ссылку</span>
                            </ActionButton>
                        </div>
                        {copied && <p role="status">Ссылка скопирована</p>}
                        <ActionButton className="text-button danger" action={() => revoke(created.id)}>
                            Отозвать ссылку
                        </ActionButton>
                    </>
                ) : (
                    <>
                        <p className="share-description">
                            Фото, имя малыша и статистика за выбранный период будут доступны всем, у кого есть ссылка.
                        </p>
                        <p className="share-description subtle">
                            Без личных заметок. Новые записи в отчёт не попадут. Доступ можно отозвать.
                        </p>
                        {report.rows.length > 0 && (
                            <ActionButton
                                action={async () =>
                                    setCreated(
                                        await mutation.mutateAsync({
                                            action: 'createShare',
                                            values: { from: report.from, to: report.to },
                                        }),
                                    )
                                }
                            >
                                Создать публичную ссылку
                            </ActionButton>
                        )}
                    </>
                )}
                <Loading query={shares}>
                    {shares.data?.items
                        .filter((item) => !item.revoked_at && item.id !== created?.id)
                        .map((item) => (
                            <div className="share-footer" key={item.id}>
                                <span>{periodLabel(item.from, item.to)}</span>
                                <ActionButton className="text-button danger" action={() => revoke(item.id)}>
                                    Отозвать ссылку
                                </ActionButton>
                            </div>
                        ))}
                </Loading>
            </div>
            <Button className="text-button" onClick={close}>
                Закрыть
            </Button>
        </Sheet>
    );
}
ShareReport.propTypes = ReportActions.propTypes;
