import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ActionButton, confirmedVersion, Form } from './Forms.jsx';
import { useSession, useWrite } from './useApi.js';

const identityFields = [
    { name: 'email', label: 'Email', type: 'email', required: true, autoComplete: 'email' },
    { name: 'password', label: 'Пароль', type: 'password', required: true, maxLength: 128 },
];
export const profileFields = [
    { name: 'name', label: 'Ваше имя', required: true, maxLength: 80, autoComplete: 'given-name' },
    { name: 'timezone', label: 'Часовой пояс IANA', required: true, placeholder: 'Europe/Moscow' },
];

export function AuthPage({ registration = false }) {
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
        <section className="card">
            <Form
                key={String(registration)}
                fields={fields}
                initial={{ timezone: 'Europe/Moscow' }}
                submit={submit}
                label={registration ? 'Создать аккаунт' : 'Войти'}
            />
            <p>
                <Link to={registration ? '/login' : '/register'}>
                    {registration ? 'Уже есть аккаунт' : 'Зарегистрироваться'}
                </Link>
            </p>
        </section>
    );
}
AuthPage.propTypes = { registration: PropTypes.bool };

export function Profile({ user }) {
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
    };
    return (
        <section className="card">
            <p>{user.email}</p>
            {user.roles.includes('user') && <Form fields={profileFields} initial={user} submit={save} />}
            {user.default_schedule_id && (
                <ActionButton
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
                action={async () => {
                    await mutation.mutateAsync({ action: 'logout' });
                    navigate('/login');
                }}
            >
                Выйти
            </ActionButton>
        </section>
    );
}
Profile.propTypes = { user: PropTypes.object.isRequired };
