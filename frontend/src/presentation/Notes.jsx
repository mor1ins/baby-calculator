import PropTypes from 'prop-types';
import { useState } from 'react';

import { ActionButton, Form } from './Forms.jsx';
import { intervalNames } from './labels.js';
import { clockTime } from './time.js';
import { useWrite } from './useApi.js';

export function Note({ interval, readOnly = false }) {
    const [editing, setEditing] = useState(false);
    const mutation = useWrite();
    const comment = interval.comment;
    const initial = comment || { id: crypto.randomUUID(), text: '', version: 0 };
    if (readOnly) return comment ? <p className="note">{comment.text}</p> : null;
    return (
        <div>
            {comment && <p className="note">{comment.text}</p>}
            <button type="button" className="text-button" onClick={() => setEditing(!editing)}>
                {noteLabel(editing, comment)}
            </button>
            {editing && (
                <Form
                    fields={[{ name: 'text', label: 'Заметка', required: true, maxLength: 1000 }]}
                    initial={initial}
                    submit={async ({ text }) => {
                        await mutation.mutateAsync({
                            action: 'saveComment',
                            key: initial.id,
                            version: initial.version,
                            values: { text, target_id: interval.id },
                        });
                        setEditing(false);
                    }}
                />
            )}
            {editing && comment && (
                <ActionButton
                    action={async () => {
                        await mutation.mutateAsync({
                            action: 'deleteComment',
                            key: comment.id,
                            version: comment.version,
                        });
                        setEditing(false);
                    }}
                >
                    Удалить заметку
                </ActionButton>
            )}
        </div>
    );
}
Note.propTypes = { interval: PropTypes.object.isRequired, readOnly: PropTypes.bool };

export function OrphanedNotes({ day, readOnly }) {
    const mutation = useWrite();
    const targets = day.timeline.filter((entry) => entry.id && !entry.comment);
    return day.orphaned_comments.map((comment) => (
        <section className="card" key={comment.id}>
            <h2>Заметка без интервала</h2>
            <p>{comment.text}</p>
            {!readOnly && (
                <>
                    {targets.length > 0 && (
                        <Form
                            fields={[
                                {
                                    name: 'target_id',
                                    label: 'Новый интервал',
                                    options: targets.map((entry) => [
                                        entry.id,
                                        `${intervalNames[entry.kind]} · ${clockTime(entry.start, day.timezone)}`,
                                    ]),
                                },
                            ]}
                            initial={{ target_id: targets[0].id }}
                            submit={({ target_id }) =>
                                mutation.mutateAsync({
                                    action: 'saveComment',
                                    key: comment.id,
                                    version: comment.version,
                                    values: { target_id, text: comment.text },
                                })
                            }
                            label="Привязать"
                        />
                    )}
                    <ActionButton
                        confirm="Удалить сохранённую заметку?"
                        action={() =>
                            mutation.mutateAsync({
                                action: 'deleteComment',
                                key: comment.id,
                                version: comment.version,
                            })
                        }
                    >
                        Удалить заметку
                    </ActionButton>
                </>
            )}
        </section>
    ));
}
OrphanedNotes.propTypes = { day: PropTypes.object.isRequired, readOnly: PropTypes.bool };

function noteLabel(editing, comment) {
    if (editing) return 'Закрыть заметку';
    return comment ? 'Изменить заметку' : 'Добавить заметку';
}
