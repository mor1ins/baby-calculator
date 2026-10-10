import PropTypes from 'prop-types';
import { useState } from 'react';

import { Form } from './Forms.jsx';
import { Button } from './Mobile.jsx';
import { Sheet } from './Sheet.jsx';
import { clockTime, duration } from './time.js';
import { useWrite } from './useApi.js';

export function SettlingNotes({ entry, day }) {
    const attempts = (day.settling || []).filter(
        (item) =>
            Date.parse(item.start_at) >= Date.parse(entry.start) &&
            Date.parse(item.start_at) < Date.parse(entry.end || day.as_of),
    );
    if (entry.kind !== 'awake') return null;
    return attempts.map((item) => (
        <p className="settling-note" key={item.id}>
            {item.end_at ? (item.sleep_id ? 'Укладывание' : 'Укладывание без сна') : 'Укладываем'} ·{' '}
            {clockTime(item.start_at, day.timezone)}
            {item.end_at &&
                `–${clockTime(item.end_at, day.timezone)} · ${duration((Date.parse(item.end_at) - Date.parse(item.start_at)) / 1000)}`}
        </p>
    ));
}
SettlingNotes.propTypes = { entry: PropTypes.object.isRequired, day: PropTypes.object.isRequired };

export function DayContext({ day, readOnly }) {
    const [open, setOpen] = useState(null);
    const mutation = useWrite();
    return (
        <>
            {day.context?.note && <p className="info-note">{day.context.note}</p>}
            {!readOnly && (
                <div className="day-context-actions">
                    <Button className="text-button" onClick={() => setOpen('context')}>
                        Обстоятельства дня
                    </Button>
                    <Button className="text-button" onClick={() => setOpen('change')}>
                        Отметить изменение режима
                    </Button>
                </div>
            )}
            {open === 'change' && <ChangeEditor date={day.date} close={() => setOpen(null)} />}
            {open === 'context' && (
                <Sheet title="Обстоятельства дня" close={() => setOpen(null)}>
                    <Form
                        initial={day.context}
                        fields={[
                            { name: 'help', label: 'Как помогали заснуть', maxLength: 500 },
                            {
                                name: 'mood',
                                label: 'Как проходило укладывание',
                                options: [
                                    ['', 'Не указано'],
                                    ['Спокойно', 'Спокойно'],
                                    ['Беспокоился', 'Беспокоился'],
                                ],
                            },
                            { name: 'note', label: 'Личная заметка о дне', type: 'textarea', maxLength: 500 },
                        ]}
                        submit={async (values) => {
                            await mutation.mutateAsync({
                                action: 'dayContext',
                                key: day.date,
                                version: day.version,
                                values,
                            });
                            setOpen(null);
                        }}
                    />
                </Sheet>
            )}
        </>
    );
}
DayContext.propTypes = { day: PropTypes.object.isRequired, readOnly: PropTypes.bool };

export function ChangeEditor({ date, close }) {
    const mutation = useWrite();
    return (
        <Sheet title="Изменение режима" close={close}>
            <Form
                initial={{ date }}
                fields={[
                    { name: 'date', label: 'Дата', type: 'date', required: true },
                    { name: 'text', label: 'Что изменили', type: 'textarea', maxLength: 500, required: true },
                ]}
                submit={async (values) => {
                    await mutation.mutateAsync({ action: 'createChange', values });
                    close();
                }}
            />
        </Sheet>
    );
}
ChangeEditor.propTypes = { date: PropTypes.string.isRequired, close: PropTypes.func.isRequired };
