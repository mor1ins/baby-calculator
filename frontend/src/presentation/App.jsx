import { useQuery } from '@tanstack/react-query';
import { KonstaProvider, Tabbar, TabbarLink } from 'konsta/react';
import PropTypes from 'prop-types';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { themeQueryKey } from '../contracts/theme.js';
import { AuthPage, Profile } from './Account.jsx';
import { AdminDiary, AdminUsers } from './Admin.jsx';
import { DayPage } from './Day.jsx';
import { History } from './History.jsx';
import { Icon } from './Icon.jsx';
import { PageHeading } from './PageHeading.jsx';
import { Schedules } from './Schedules.jsx';
import { SessionState } from './SessionState.jsx';
import { PublicReport, Statistics } from './Statistics.jsx';
import { useSession } from './useApi.js';

const sections = [
    { path: '/', title: 'Сегодня', description: '', icon: 'sun' },
    { path: '/history', title: 'История', description: 'Каждый день складывается в историю', icon: 'calendar' },
    { path: '/statistics', title: 'Статистика', description: 'Замечайте ритм, день за днём', icon: 'chart' },
    { path: '/schedules', title: 'Мои графики', description: 'Ориентиры для вашего дня', icon: 'sliders' },
    { path: '/profile', title: 'Профиль', description: 'Ваш малыш и ваше пространство', icon: 'user' },
];

function Page({ title, description, section, registrationEnabled = false }) {
    const session = useSession();
    const user = session.data?.user;
    return (
        <>
            {!['/', '/statistics', 'login', 'register'].includes(section) && (
                <PageHeading title={title} description={description} />
            )}
            <SessionState hideAnonymous={['login', 'register'].includes(section)} />
            {section === 'login' && <AuthPage registrationEnabled={registrationEnabled} />}
            {section === 'register' && <AuthPage registration registrationEnabled={registrationEnabled} />}
            {user && !user.blocked && !session.isError && <Content section={section} user={user} />}
        </>
    );
}
Page.propTypes = {
    title: PropTypes.string.isRequired,
    description: PropTypes.string,
    section: PropTypes.string,
    registrationEnabled: PropTypes.bool,
};

export function App({ registrationEnabled = false, platform = 'ios' }) {
    const location = useLocation();
    const theme = useQuery({ queryKey: themeQueryKey, enabled: false });
    const publicPage = location.pathname.startsWith('/s/');
    const authPage = ['/login', '/register'].includes(location.pathname);
    const section = sections.find((item) => item.path === location.pathname);
    return (
        <KonstaProvider theme={platform} dark={theme.data?.resolved === 'dark'} autoThemeDetection={false}>
            <div className="app-shell device">
                <a className="skip-link" href="#screen">
                    К содержимому
                </a>
                {hasHeader(location.pathname) && <BrandHeader />}
                <main
                    id="screen"
                    data-page={
                        publicPage ? 'public-report' : location.pathname === '/' ? 'day' : location.pathname.slice(1)
                    }
                    tabIndex={-1}
                >
                    <Routes>
                        {sections.map(({ path, title, description }) => (
                            <Route
                                key={path}
                                path={path}
                                element={<Page title={title} description={description} section={path} />}
                            />
                        ))}
                        <Route
                            path="/login"
                            element={
                                <Page
                                    section="login"
                                    title="С возвращением"
                                    description="Ваш дневник ждёт вас"
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
                                        title="Начнём знакомство"
                                        description="Создайте свой дневник"
                                        registrationEnabled
                                    />
                                ) : (
                                    <Navigate to="/login" replace />
                                )
                            }
                        />
                        <Route
                            path="/admin"
                            element={<Page section="admin" title="Пользователи" description="Управление доступом" />}
                        />
                        <Route
                            path="/admin/:owner"
                            element={
                                <Page section="adminDiary" title="Дневник пользователя" description="Только просмотр" />
                            }
                        />
                        <Route path="/s/:token" element={<PublicReport />} />
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
                {!publicPage && !authPage && <Navigation section={section} />}
            </div>
        </KonstaProvider>
    );
}
App.propTypes = { registrationEnabled: PropTypes.bool, platform: PropTypes.string };

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
    const Component = { '/': DayPage, '/schedules': Schedules, '/history': History, '/statistics': Statistics }[
        section
    ];
    return Component ? <Component user={user} /> : null;
}
Content.propTypes = { section: PropTypes.string, user: PropTypes.object.isRequired };

function BrandHeader() {
    const session = useSession();
    return (
        <header className="app-header">
            <Link className="brand" to="/" aria-label="Тише — на главную">
                <span className="brand-symbol">◔</span> тише<span className="brand-dot">.</span>
            </Link>
            <Link className="avatar" to="/profile" aria-label="Открыть профиль">
                {session.data?.user?.name.slice(0, 1) || <Icon name="user" />}
            </Link>
        </header>
    );
}

function Navigation({ section }) {
    return (
        <nav id="navigation" className="bottom-nav" aria-label="Основная навигация">
            <Tabbar className="mobile-tabbar" innerClassName="mobile-tabbar-inner" icons labels data-konsta="Tabbar">
                {sections.map(({ path, title, icon }) => (
                    <TabbarLink
                        key={path}
                        component={Link}
                        to={path}
                        active={section?.path === path}
                        aria-label={title}
                        aria-current={section?.path === path ? 'page' : undefined}
                        icon={<Icon name={icon} />}
                        label={path === '/schedules' ? 'Графики' : title}
                    />
                ))}
            </Tabbar>
        </nav>
    );
}
Navigation.propTypes = { section: PropTypes.object };

function hasHeader(path) {
    return (
        sections.some((item) => item.path === path) ||
        ['/login', '/register'].includes(path) ||
        path.startsWith('/admin')
    );
}
