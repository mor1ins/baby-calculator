import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { DayPage } from './Day.jsx';
import { Form, Loading } from './Forms.jsx';
import { History } from './History.jsx';
import { Icon } from './Icon.jsx';
import { Button, Card } from './Mobile.jsx';
import { Schedules } from './Schedules.jsx';
import { Sheet } from './Sheet.jsx';
import { useRead, useWrite } from './useApi.js';

export function AdminUsers() {
    const [search, setSearch] = useState('');
    const [cursor, setCursor] = useState(null);
    const query = useRead({ action: 'users', values: { q: search, ...(cursor ? { cursor } : {}) } });
    return (
        <>
            <AdminSummary users={query.data?.items} />
            <div className="readonly-banner">
                <Icon name="lock" />
                Дневники доступны только для чтения
            </div>
            <label className="subtle" htmlFor="user-search">
                Поиск по имени или email
            </label>
            <input
                id="user-search"
                type="search"
                placeholder="Найти пользователя"
                value={search}
                maxLength={100}
                onChange={(event) => {
                    setSearch(event.target.value);
                    setCursor(null);
                }}
            />
            <Loading query={query}>
                {query.data?.items.map((user) => (
                    <UserCard key={user.id} user={user} />
                ))}
                {query.data?.items.length === 0 && <p className="subtle">Пользователи не найдены</p>}
            </Loading>
            {query.data?.next_cursor && (
                <Button className="outline-button" onClick={() => setCursor(query.data.next_cursor)}>
                    Следующие пользователи
                </Button>
            )}
            {cursor && (
                <Button className="text-button" onClick={() => setCursor(null)}>
                    К началу списка
                </Button>
            )}
        </>
    );
}

function UserCard({ user }) {
    const [editing, setEditing] = useState(false);
    const mutation = useWrite();
    return (
        <Card className="user-card">
            <div className="user-heading">
                <div className="avatar">{user.name.slice(0, 1)}</div>
                <div>
                    <h3>{user.name}</h3>
                    <p className="subtle">{user.email}</p>
                </div>
            </div>
            <p className={`status ${user.blocked ? 'blocked' : ''}`}>{user.blocked ? 'Заблокирован' : 'Активен'}</p>
            <div className="card-actions">
                <Link to={`/admin/${user.id}`}>Открыть дневник</Link>
                {!user.roles.includes('admin') && (
                    <button type="button" className={user.blocked ? '' : 'danger'} onClick={() => setEditing(true)}>
                        {user.blocked ? 'Разблокировать' : 'Заблокировать'}
                    </button>
                )}
            </div>
            {editing && (
                <Sheet
                    title={user.blocked ? 'Восстановить доступ?' : 'Заблокировать аккаунт?'}
                    close={() => setEditing(false)}
                >
                    <p className="subtle">
                        {user.name} · {user.email}
                    </p>
                    <Form
                        fields={[
                            {
                                name: 'reason',
                                label: 'Причина изменения статуса',
                                required: true,
                                maxLength: 500,
                                type: 'textarea',
                            },
                        ]}
                        label={user.blocked ? 'Разблокировать' : 'Заблокировать'}
                        submit={async ({ reason }) => {
                            await mutation.mutateAsync({
                                action: 'status',
                                key: user.id,
                                version: user.version,
                                values: { blocked: !user.blocked, reason },
                            });
                            setEditing(false);
                        }}
                    />
                </Sheet>
            )}
        </Card>
    );
}
UserCard.propTypes = { user: PropTypes.object.isRequired };

export function AdminDiary({ user }) {
    const { owner } = useParams();
    return (
        <>
            <div className="readonly-banner">
                <Icon name="lock" />
                Дневник пользователя · только чтение
            </div>
            <Link to="/admin">К пользователям</Link>
            <DayPage user={user} owner={owner} />
            <details className="card">
                <summary>История пользователя</summary>
                <History user={user} owner={owner} />
            </details>
            <details className="card">
                <summary>Графики пользователя · только чтение</summary>
                <Schedules user={user} owner={owner} />
            </details>
        </>
    );
}
AdminDiary.propTypes = { user: PropTypes.object.isRequired };

function AdminSummary({ users }) {
    return (
        <div className="admin-summary">
            <div>
                <strong>{users?.length ?? '—'}</strong>
                <span>на странице</span>
            </div>
            <div>
                <strong>{users?.filter((user) => !user.blocked).length ?? '—'}</strong>
                <span>активных</span>
            </div>
        </div>
    );
}
AdminSummary.propTypes = { users: PropTypes.array };
