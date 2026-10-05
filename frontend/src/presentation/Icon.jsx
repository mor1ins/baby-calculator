import PropTypes from 'prop-types';

const paths = {
    sun: 'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 7 7m10 10 1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    moon: 'M20 15.2A8.5 8.5 0 0 1 8.8 4a8.5 8.5 0 1 0 11.2 11.2Z',
    clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
    calendar:
        'M8 3v4m8-4v4M4 10h16M7 14h2m6 0h2M7 18h2M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z',
    sliders: 'M3 6h18M3 12h18M3 18h18M9 4v4m7 2v4m-8 2v4',
    user: 'M4 21v-3a8 8 0 0 1 16 0v3M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
    plus: 'M12 5v14M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    next: 'm9 5 7 7-7 7',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
};
export function Icon({ name }) {
    return (
        <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d={paths[name]} />
        </svg>
    );
}
Icon.propTypes = { name: PropTypes.string.isRequired };
