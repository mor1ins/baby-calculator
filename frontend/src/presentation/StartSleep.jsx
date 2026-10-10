import PropTypes from 'prop-types';
import { useEffect, useRef, useState } from 'react';

import { ActionButton } from './Forms.jsx';
import { Button } from './Mobile.jsx';
import { Sheet } from './Sheet.jsx';
import { clockTime } from './time.js';

const minuteWords = { one: 'минуту', few: 'минуты', many: 'минут', other: 'минут' };
const minutePlural = new Intl.PluralRules('ru');
const minutesLabel = (value) =>
    value === 0 ? 'Только что' : `${value} ${minuteWords[minutePlural.select(value)]} назад`;
export function StartSleep({ start, zone, close }) {
    const [minutes, setMinutes] = useState(5);
    const wheel = useRef(null);
    useEffect(() => {
        wheel.current.scrollTop = 5 * wheel.current.firstElementChild.getBoundingClientRect().height;
        wheel.current.focus();
    }, []);
    const select = (value) => {
        const next = Math.max(0, Math.min(60, value));
        setMinutes(next);
        wheel.current.scrollTop = next * wheel.current.firstElementChild.getBoundingClientRect().height;
    };
    const keydown = (event) => {
        const values = {
            ArrowUp: minutes - 1,
            ArrowDown: minutes + 1,
            Home: 0,
            End: 60,
            PageUp: minutes - 5,
            PageDown: minutes + 5,
        };
        if (event.key in values) {
            event.preventDefault();
            select(values[event.key]);
        }
    };
    return (
        <Sheet title="Когда уснул?" close={close}>
            <p className="wheel-hint" id="minutes-hint">
                Прокрутите, чтобы выбрать минуты назад
            </p>
            <div className="minute-wheel-frame">
                <div
                    ref={wheel}
                    className="minute-wheel"
                    role="spinbutton"
                    tabIndex={0}
                    aria-label="Минут назад"
                    aria-describedby="minutes-hint"
                    aria-valuemin={0}
                    aria-valuemax={60}
                    aria-valuenow={minutes}
                    aria-valuetext={minutesLabel(minutes)}
                    onKeyDown={keydown}
                    onScroll={(event) =>
                        setMinutes(
                            Math.max(
                                0,
                                Math.min(
                                    60,
                                    Math.round(
                                        event.currentTarget.scrollTop /
                                            event.currentTarget.firstElementChild.getBoundingClientRect().height,
                                    ),
                                ),
                            ),
                        )
                    }
                >
                    {Array.from({ length: 61 }, (_, index) => (
                        <div
                            key={index}
                            className={`minute-option ${minutes === index ? 'is-selected' : ''}`}
                            aria-hidden="true"
                        >
                            {minutesLabel(index)}
                        </div>
                    ))}
                </div>
            </div>
            <p className="start-preview">
                Начало сна — <strong>{clockTime(new Date(Date.now() - minutes * 60000).toISOString(), zone)}</strong>
            </p>
            <div className="start-sleep-actions">
                <ActionButton
                    action={async () => {
                        await start(minutes);
                        close();
                    }}
                >
                    Записать сон
                </ActionButton>
            </div>
            <Button className="text-button add-past" onClick={close}>
                Отмена
            </Button>
        </Sheet>
    );
}
StartSleep.propTypes = {
    start: PropTypes.func.isRequired,
    close: PropTypes.func.isRequired,
    zone: PropTypes.string.isRequired,
};
