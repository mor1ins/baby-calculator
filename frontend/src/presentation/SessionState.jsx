import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { commands } from '../contracts/messages.js';
import { useBus } from './BusContext.jsx';

export function SessionState() {
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
        return (
            <p>
                Сохраняйте историю сна в своём аккаунте. <Link to="/login">Войти</Link>
            </p>
        );
    return <p className="sr-only">Здравствуйте, {session.data.user.name}. Ваш дневник подключён.</p>;
}

function accessMessage(error, user) {
    if (error?.code === 'account_blocked' || user?.blocked) {
        return <p role="alert">Доступ к аккаунту ограничен. Свяжитесь с администратором.</p>;
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
