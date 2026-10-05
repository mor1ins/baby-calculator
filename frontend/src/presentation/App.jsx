import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import { Link, Navigate, NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { AuthPage, Profile } from './Account.jsx';
import { AdminDiary, AdminUsers } from './Admin.jsx';
import { DayPage } from './Day.jsx';
import { History } from './History.jsx';
import { Icon } from './Icon.jsx';
import { Schedules } from './Schedules.jsx';
import { SessionState } from './SessionState.jsx';
import { useSession } from './useApi.js';

const sections = [
    { path: '/', title: 'Сегодня', description: 'Сон, бодрствование и спокойный ритм вашего дня.' },
    { path: '/history', title: 'История', description: 'Дневник, к которому можно вернуться.' },
    { path: '/schedules', title: 'Мои графики', description: 'Разные планы для обычных и особенных дней.' },
    { path: '/profile', title: 'Профиль', description: 'Ваш аккаунт и настройки дневника.' },
];

function Page({ title, description, section, registrationEnabled = false }) {
    const session = useSession();
    const user = session.data?.user;
    const heading = useRef(null);
    const location = useLocation();
    useEffect(() => {
        document.title = `${title} — Тише`;
        heading.current?.focus();
    }, [title, location.pathname]);
    return (
        <>
            <header className="page-header">
                <h1 ref={heading} tabIndex={-1}>
                    {title}
                </h1>
                {section !== '/' && <p className="muted">{description}</p>}
            </header>
            <section className="session-state" aria-label="Подключение дневника">
                <SessionState />
            </section>
            {section === 'login' && <AuthPage registrationEnabled={registrationEnabled} />}
            {section === 'register' && <AuthPage registration registrationEnabled={registrationEnabled} />}
            {user && !user.blocked && !session.isError && <Content section={section} user={user} />}
        </>
    );
}
Page.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    section: PropTypes.string,
    registrationEnabled: PropTypes.bool,
};

export function App({ registrationEnabled = false }) {
    return (
        <div className="app-shell">
            <a className="skip-link" href="#content">
                К содержимому
            </a>
            <header className="brand">
                <Link to="/" aria-label="Тише — на главную">
                    <img className="brand-mark" src="/tishe.svg" alt="" width="19" height="19" />{' '}
                    <span>
                        тише<span className="brand-period">.</span>
                    </span>
                </Link>
                <Link className="avatar" to="/profile" aria-label="Открыть профиль">
                    <Icon name="user" />
                </Link>
            </header>
            <main id="content">
                <Routes>
                    {sections.map(({ path, ...page }) => (
                        <Route key={path} path={path} element={<Page {...page} section={path} />} />
                    ))}
                    <Route
                        path="/login"
                        element={
                            <Page
                                section="login"
                                title="Вход"
                                description="Вернитесь к своему дневнику."
                                registrationEnabled={registrationEnabled}
                            />
                        }
                    />
                    <Route
                        path="/register"
                        element={
                            registrationEnabled ? (
                                <Page
                                    section="register"
                                    title="Регистрация"
                                    description="Начните историю вашего малыша."
                                    registrationEnabled
                                />
                            ) : (
                                <Navigate to="/login" replace />
                            )
                        }
                    />
                    <Route
                        path="/admin"
                        element={<Page section="admin" title="Пользователи" description="Управление доступом." />}
                    />
                    <Route
                        path="/admin/:owner"
                        element={
                            <Page section="adminDiary" title="Дневник пользователя" description="Только просмотр." />
                        }
                    />
                    <Route
                        path="*"
                        element={
                            <section className="card">
                                <h1>Страница не найдена</h1>
                                <Link to="/">На главную</Link>
                            </section>
                        }
                    />
                </Routes>
            </main>
            <nav aria-label="Основная навигация">
                {sections.map(({ path, title }) => (
                    <NavLink aria-label={title} key={path} to={path} end={path === '/'}>
                        <Icon
                            name={
                                { '/': 'sun', '/history': 'calendar', '/schedules': 'sliders', '/profile': 'user' }[
                                    path
                                ]
                            }
                        />
                        <span>{title === 'Мои графики' ? 'Графики' : title}</span>
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}

App.propTypes = { registrationEnabled: PropTypes.bool };

function Content({ section, user }) {
    if (section === '/profile') return <Profile user={user} />;
    if (section === 'admin' || section === 'adminDiary') {
        if (!user.roles.includes('admin')) return <p role="alert">Недостаточно прав.</p>;
        return section === 'admin' ? <AdminUsers /> : <AdminDiary user={user} />;
    }
    if (!user.roles.includes('user'))
        return (
            <p>
                <Link to="/admin">Открыть список пользователей</Link>
            </p>
        );
    const pages = { '/': DayPage, '/schedules': Schedules, '/history': History };
    const Component = pages[section];
    return Component ? <Component user={user} /> : null;
}
Content.propTypes = { section: PropTypes.string, user: PropTypes.object.isRequired };
