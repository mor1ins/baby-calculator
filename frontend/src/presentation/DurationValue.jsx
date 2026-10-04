import PropTypes from 'prop-types';

import { duration } from './time.js';

export function DurationValue({ seconds }) {
    if (seconds === null || seconds === undefined) return '—';
    const minutes = Math.floor(seconds / 60);
    return (
        <span className="duration-value" aria-label={duration(seconds)}>
            {Math.floor(minutes / 60)}
            <small> ч </small>
            {minutes % 60}
            <small> м</small>
        </span>
    );
}
DurationValue.propTypes = { seconds: PropTypes.number };
