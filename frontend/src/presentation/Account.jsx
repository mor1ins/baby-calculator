import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ChildCard } from './Child.jsx';
import { ActionButton, confirmedVersion, Form } from './Forms.jsx';
import { Icon } from './Icon.jsx';
import { Button, Section, Setting, SettingsList } from './Mobile.jsx';
import { Sheet } from './Sheet.jsx';
import { ThemeSelector } from './theme/ThemeSelector.jsx';
import { useRead, useSession, useWrite } from './useApi.js';

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
                <span className="auth-moon">
                    <Icon name="moon" />
                </span>
                <span className="kicker">ДНЕВНИК СНА МАЛЫША</span>
                <p>
                    Спокойствие начинается
                    <br />с понятного ритма.
                </p>
            </div>
            <AuthHeading registration={registration} />
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
    const schedules = useRead({ action: 'schedules' }, { enabled: user.roles.includes('user') });
    const [panel, setPanel] = useState(null);
    return (
        <section className="profile-page">
            {user.roles.includes('user') && (
                <>
                    <Section title="Малыш" />
                    <ChildCard profile zone={user.timezone} />
                </>
            )}
            <Section title="Родитель" />
            <div className="account-card">
                <div className="avatar">{user.name.slice(0, 1)}</div>
                <div>
                    <h2>{user.name}</h2>
                    <p className="subtle">{user.email}</p>
                </div>
                <Button
                    className="icon-button"
                    aria-label="Изменить личные данные"
                    onClick={() => {
                        setPanel('identity');
                        setEditing(true);
                    }}
                >
                    <Icon name="next" />
                </Button>
            </div>
            <Section title="Настройки" />
            <SettingsList>
                <Setting
                    title="Тема оформления"
                    subtitle="Светлая, тёмная или системная"
                    icon="moon"
                    onClick={() => setPanel('theme')}
                />
                <Setting
                    title="Часовой пояс"
                    subtitle={user.timezone}
                    icon="clock"
                    onClick={() => {
                        setPanel('timezone');
                        setEditing(true);
                    }}
                />
                <Setting
                    title="Мои графики"
                    subtitle={`${schedules.data?.items.length || 0} личных графиков`}
                    icon="sliders"
                    onClick={() => navigate('/schedules')}
                />
                {user.roles.includes('admin') && (
                    <Setting
                        title="Пользователи"
                        subtitle="Просмотр дневников и управление доступом"
                        icon="user"
                        onClick={() => navigate('/admin')}
                    />
                )}
            </SettingsList>
            {editing && (
                <Sheet title={panel === 'timezone' ? 'Часовой пояс' : 'Личные данные'} close={() => setEditing(false)}>
                    <Form
                        fields={profileFields.filter(
                            (field) => field.name === (panel === 'timezone' ? 'timezone' : 'name'),
                        )}
                        initial={user}
                        submit={save}
                    />
                </Sheet>
            )}
            {panel === 'theme' && (
                <Sheet title="Тема оформления" close={() => setPanel(null)}>
                    <ThemeSelector />
                </Sheet>
            )}
            <ActionButton
                className="outline-button"
                action={async () => {
                    await mutation.mutateAsync({ action: 'logout' });
                    navigate('/login');
                }}
            >
                <Icon name="logout" />
                Выйти из аккаунта
            </ActionButton>
        </section>
    );
}
Profile.propTypes = { user: PropTypes.object.isRequired };

function AuthHeading({ registration }) {
    return (
        <>
            {' '}
            <h1 className="auth-title">
                {registration ? (
                    <>
                        Начнём ваш
                        <br />
                        дневник
                    </>
                ) : (
                    <>
                        Рады видеть
                        <br />
                        вас снова
                    </>
                )}
            </h1>
            <p className="subtle">
                {registration ? 'Сохраняйте ритм малыша день за днём.' : 'Ваши графики и история уже здесь.'}
            </p>
        </>
    );
}
AuthHeading.propTypes = { registration: PropTypes.bool };
