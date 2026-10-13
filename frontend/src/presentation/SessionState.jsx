import { useQuery } from '@tanstack/react-query';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';

import { commands } from '../contracts/messages.js';
import { useBus } from './BusContext.jsx';
import { Icon } from './Icon.jsx';

export function SessionState({ hideAnonymous = false }) {
    const bus = useBus();
    const session = useQuery({
        queryKey: ['session'],
        queryFn: ({ signal }) => bus.send({ type: commands.loadSession }, { signal }),
    });
    if (session.isPending) return <p role="status">Подключаем дневник…</p>;
    const accessError = accessMessage(session.error, session.data?.user);
    if (accessError) return accessError;
    if (session.isError) {
        return (
            <div role="alert">
                <p>Не удалось подключиться к дневнику. Попробуйте ещё раз.</p>
                <button type="button" disabled={session.isFetching} onClick={() => session.refetch()}>
                    {session.isFetching ? 'Подключаем…' : 'Повторить'}
                </button>
            </div>
        );
    }
    if (!session.data.user)
        return hideAnonymous ? null : (
            <p>
                Сохраняйте историю сна в своём аккаунте. <Link to="/login">Войти</Link>
            </p>
        );
    return <p className="sr-only">Здравствуйте, {session.data.user.name}. Ваш дневник подключён.</p>;
}

function accessMessage(error, user) {
    if (error?.code === 'account_blocked' || user?.blocked) {
        return (
            <div className="empty welcome-card" role="alert">
                <div className="empty-orbit">
                    <Icon name="lock" />
                </div>
                <h2>Доступ приостановлен</h2>
                <p>
                    Доступ к аккаунту ограничен.
                    <br />
                    Ваши записи сохранены.
                    <br />
                    Для восстановления доступа обратитесь к администратору.
                </p>
                <Link className="outline-button" to="/login">
                    Вернуться ко входу
                </Link>
            </div>
        );
    }
    if (error?.status === 401) {
        return (
            <p role="alert">
                Сессия завершилась. <Link to="/login">Войти снова</Link>
            </p>
        );
    }
    return null;
}

SessionState.propTypes = { hideAnonymous: PropTypes.bool };
