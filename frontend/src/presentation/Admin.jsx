import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DayPage } from './Day.jsx';
import { Form, Loading } from './Forms.jsx';
import { History } from './History.jsx';
import { Schedules } from './Schedules.jsx';
import { useRead, useWrite } from './useApi.js';

export function AdminUsers() {
    const [search, setSearch] = useState('');
    const [cursor, setCursor] = useState(null);
    const query = useRead({ action: 'users', values: { q: search, ...(cursor ? { cursor } : {}) } });
    const mutation = useWrite();
    return (
        <>
            <Form
                fields={[{ name: 'q', label: 'Имя или email', maxLength: 100 }]}
                label="Найти"
                submit={({ q }) => {
                    setSearch(q);
                    setCursor(null);
                }}
            />
            <Loading query={query}>
                {query.data?.items.map((user) => (
                    <section className="card" key={user.id}>
                        <h2>{user.name}</h2>
                        <p>{user.email}</p>
                        <p>{user.blocked ? 'Заблокирован' : 'Активен'}</p>
                        <Link to={`/admin/${user.id}`}>Просмотреть дневник</Link>
                        {!user.roles.includes('admin') && (
                            <Form
                                fields={[
                                    {
                                        name: 'reason',
                                        label: 'Причина изменения статуса',
                                        required: true,
                                        maxLength: 500,
                                    },
                                ]}
                                label={user.blocked ? 'Разблокировать' : 'Заблокировать'}
                                submit={({ reason }) =>
                                    mutation.mutateAsync({
                                        action: 'status',
                                        key: user.id,
                                        version: user.version,
                                        values: { blocked: !user.blocked, reason },
                                    })
                                }
                            />
                        )}
                    </section>
                ))}
            </Loading>
            {query.data?.next_cursor && (
                <button type="button" onClick={() => setCursor(query.data.next_cursor)}>
                    Следующие пользователи
                </button>
            )}
            {cursor && (
                <button type="button" onClick={() => setCursor(null)}>
                    К началу списка
                </button>
            )}
        </>
    );
}

export function AdminDiary({ user }) {
    const { owner } = useParams();
    return (
        <>
            <p className="notice">Просмотр дневника. Изменение чужих данных недоступно.</p>
            <Link to="/admin">К пользователям</Link>
            <DayPage user={user} owner={owner} />
            <details className="card">
                <summary>История пользователя</summary>
                <History user={user} owner={owner} />
            </details>
            <h2>Графики пользователя</h2>
            <Schedules user={user} owner={owner} />
        </>
    );
}
AdminDiary.propTypes = { user: PropTypes.object.isRequired };
