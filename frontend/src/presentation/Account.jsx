import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ActionButton, confirmedVersion, Form } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Sheet } from './Sheet.jsx';
import { ThemeSelector } from './theme/ThemeSelector.jsx';
import { useSession, useWrite } from './useApi.js';

const identityFields = [
    { name: 'email', label: 'Email', type: 'email', required: true, autoComplete: 'email' },
    { name: 'password', label: 'Пароль', type: 'password', required: true, maxLength: 128 },
];
export const profileFields = [
    { name: 'name', label: 'Ваше имя', required: true, maxLength: 80, autoComplete: 'given-name' },
    { name: 'timezone', label: 'Часовой пояс', required: true, placeholder: 'Europe/Moscow' },
];

export function AuthPage({ registration = false, registrationEnabled }) {
    const session = useSession();
    const mutation = useWrite();
    const navigate = useNavigate();
    const credentials = identityFields.map((field) =>
        field.name === 'password' ? { ...field, minLength: registration ? 8 : 1 } : field,
    );
    const fields = registration ? [...profileFields, ...credentials] : credentials;
    const submit = async (values) => {
        await mutation.mutateAsync({ action: registration ? 'register' : 'login', values });
        navigate('/');
    };
    if (!session.data && !session.isPending) return <p>Обновите сессию кнопкой «Повторить» выше перед входом.</p>;
    return (
        <section className="auth-form">
            <div className="auth-art">
                <Icon name="moon" />
                <p>
                    Маленькие заметки о сне.
                    <br />
                    Больше спокойствия каждый день.
                </p>
            </div>
            <Form
                key={String(registration)}
                fields={fields}
                initial={{ timezone: 'Europe/Moscow' }}
                submit={submit}
                disabled={session.isPending}
                label={registration ? 'Создать аккаунт' : 'Войти'}
            />
            {(registration || registrationEnabled) && (
                <p>
                    <Link to={registration ? '/login' : '/register'}>
                        {registration ? 'Уже есть аккаунт' : 'Зарегистрироваться'}
                    </Link>
                </p>
            )}
        </section>
    );
}
AuthPage.propTypes = { registration: PropTypes.bool, registrationEnabled: PropTypes.bool };

export function Profile({ user }) {
    const [editing, setEditing] = useState(false);
    const [baseline, setBaseline] = useState(user.version);
    const mutation = useWrite();
    const navigate = useNavigate();
    const save = async (values) => {
        const result = await mutation.mutateAsync({
            action: 'profile',
            version: confirmedVersion(baseline, user.version),
            values,
        });
        setBaseline(result.version);
        setEditing(false);
    };
    return (
        <section className="profile-page">
            <div className="profile-hero">
                <span className="avatar">{user.name.slice(0, 1)}</span>
                <h2>{user.name}</h2>
                <p className="muted">{user.email}</p>
            </div>
            <div className="card">
                <ThemeSelector />
                {user.roles.includes('user') && (
                    <>
                        <button type="button" className="settings-row" onClick={() => setEditing(true)}>
                            <Icon name="user" />
                            <span>
                                Личные данные<small>{user.name}</small>
                            </span>
                            <Icon name="next" />
                        </button>
                        <button type="button" className="settings-row" onClick={() => setEditing(true)}>
                            <Icon name="clock" />
                            <span>
                                Часовой пояс<small>{user.timezone}</small>
                            </span>
                            <Icon name="next" />
                        </button>
                        {editing && (
                            <Sheet title="Настройки дневника" close={() => setEditing(false)}>
                                <Form fields={profileFields} initial={user} submit={save} />
                            </Sheet>
                        )}
                    </>
                )}
                {user.default_schedule_id && (
                    <ActionButton
                        className="settings-row"
                        action={() =>
                            mutation.mutateAsync({
                                action: 'profile',
                                version: user.version,
                                values: { default_schedule_id: null },
                            })
                        }
                    >
                        Сбросить график по умолчанию
                    </ActionButton>
                )}
                {user.roles.includes('admin') && (
                    <p>
                        <Link to="/admin">Пользователи и просмотр дневников</Link>
                    </p>
                )}
                <ActionButton
                    className="settings-row"
                    action={async () => {
                        await mutation.mutateAsync({ action: 'logout' });
                        navigate('/login');
                    }}
                >
                    Выйти
                </ActionButton>
            </div>
        </section>
    );
}
Profile.propTypes = { user: PropTypes.object.isRequired };
