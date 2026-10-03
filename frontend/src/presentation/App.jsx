import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';
import { Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';

import { AuthPage, Profile } from './Account.jsx';
import { AdminDiary, AdminUsers } from './Admin.jsx';
import { DayPage } from './Day.jsx';
import { History } from './History.jsx';
import { Schedules } from './Schedules.jsx';
import { SessionState } from './SessionState.jsx';
import { useSession } from './useApi.js';

const sections = [
    { path: '/', title: 'Сегодня', description: 'Сон, бодрствование и спокойный ритм вашего дня.' },
    { path: '/schedules', title: 'Мои графики', description: 'Разные планы для обычных и особенных дней.' },
    { path: '/history', title: 'История', description: 'Дневник, к которому можно вернуться.' },
    { path: '/profile', title: 'Профиль', description: 'Ваш аккаунт и настройки дневника.' },
];

function Page({ title, description, section }) {
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
                <p className="eyebrow">МАЛЕНЬКИМИ ШАГАМИ, В СВОЁМ РИТМЕ</p>
                <h1 ref={heading} tabIndex={-1}>
                    {title}
                </h1>
                <p>{description}</p>
            </header>
            <section className="card" aria-label="Подключение дневника">
                <SessionState />
            </section>
            {section === 'login' && <AuthPage />}
            {section === 'register' && <AuthPage registration />}
            {user && !user.blocked && !session.isError && <Content section={section} user={user} />}
        </>
    );
}
Page.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    section: PropTypes.string,
};

export function App() {
    return (
        <div className="app-shell">
            <a className="skip-link" href="#content">
                К содержимому
            </a>
            <header className="brand">
                <Link to="/" aria-label="Тише — на главную">
                    ☾ <span>тише</span>
                </Link>
                <span className="brand-note">дневник сна малыша</span>
            </header>
            <main id="content">
                <Routes>
                    {sections.map(({ path, ...page }) => (
                        <Route key={path} path={path} element={<Page {...page} section={path} />} />
                    ))}
                    <Route
                        path="/login"
                        element={<Page section="login" title="Вход" description="Вернитесь к своему дневнику." />}
                    />
                    <Route
                        path="/register"
                        element={
                            <Page section="register" title="Регистрация" description="Начните историю вашего малыша." />
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
                    <NavLink key={path} to={path} end={path === '/'}>
                        {title}
                    </NavLink>
                ))}
            </nav>
        </div>
    );
}

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
