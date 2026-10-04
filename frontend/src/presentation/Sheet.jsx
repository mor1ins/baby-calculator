import PropTypes from 'prop-types';
import { useEffect, useId, useRef } from 'react';

import { Icon } from './Icon.jsx';

export function Sheet({ title, close, children }) {
    const dialog = useRef(null);
    const id = useId();
    useEffect(() => {
        const element = dialog.current;
        const trigger = document.activeElement;
        element.showModal();
        return () => {
            element.close();
            trigger?.focus();
        };
    }, []);
    return (
        <dialog
            ref={dialog}
            className="sheet"
            onKeyDown={trapFocus}
            aria-labelledby={id}
            onCancel={(event) => {
                event.preventDefault();
                close();
            }}
        >
            <header className="sheet-head">
                <h2 id={id}>{title}</h2>
                <button type="button" className="icon-button" aria-label="Закрыть" onClick={close}>
                    <Icon name="close" />
                </button>
            </header>
            {children}
        </dialog>
    );
}
Sheet.propTypes = { title: PropTypes.string.isRequired, close: PropTypes.func.isRequired, children: PropTypes.node };

function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const controls = [
        ...event.currentTarget.querySelectorAll('button, input, select, textarea, a[href], [tabindex="0"]'),
    ].filter((element) => !element.disabled && element.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
    }
}
