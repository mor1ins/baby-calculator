import PropTypes from 'prop-types';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Metrics } from './Day.jsx';
import { Loading } from './Forms.jsx';
import { dateShift, today } from './time.js';
import { useRead } from './useApi.js';

export function History({ user, owner }) {
    const [end, setEnd] = useState(today(user.timezone));
    const start = dateShift(end, -30);
    const query = useRead({
        action: owner ? 'adminHistory' : 'history',
        parent: owner,
        values: { from: start, to: end },
    });
    return (
        <>
            <div className="day-picker">
                <button type="button" onClick={() => setEnd(dateShift(end, -31))}>
                    Раньше
                </button>
                <span>
                    {start} — {end}
                </span>
                <button type="button" onClick={() => setEnd(dateShift(end, 31))}>
                    Позже
                </button>
            </div>
            <Loading query={query}>
                {query.data?.items.length === 0 && <p>В этом периоде записей пока нет.</p>}
                {query.data?.items.map((day) => (
                    <section key={day.date} className="card">
                        <h2>
                            <Link to={`${owner ? '/admin/' + owner : '/'}?date=${day.date}`}>{day.date}</Link>
                        </h2>
                        <p>{day.complete ? 'День завершён' : 'Есть неполные данные'}</p>
                        <Metrics value={day.metrics} />
                    </section>
                ))}
            </Loading>
        </>
    );
}
History.propTypes = { user: PropTypes.object.isRequired, owner: PropTypes.string };
