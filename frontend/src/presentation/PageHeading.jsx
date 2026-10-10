import PropTypes from 'prop-types';
import { useEffect, useRef } from 'react';

export function PageHeading({ title, description, children }) {
    const heading = useRef(null);
    useEffect(() => {
        document.title = `${title} — Тише`;
        heading.current?.focus();
    }, [title]);
    return (
        <div className="page-head">
            <div>
                <h1 ref={heading} tabIndex={-1}>
                    {title}
                </h1>
                {description && <p className="subtle">{description}</p>}
            </div>
            {children}
        </div>
    );
}
PageHeading.propTypes = { title: PropTypes.string.isRequired, description: PropTypes.string, children: PropTypes.node };
