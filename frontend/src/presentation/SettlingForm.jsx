import PropTypes from 'prop-types';

import { Form } from './Forms.jsx';
import { Sheet } from './Sheet.jsx';
import { absoluteTime, inputTime } from './time.js';
import { useWrite } from './useApi.js';

export function SettlingForm({ attempt, day, close }) {
    const mutation = useWrite();
    return (
        <Sheet title="Границы укладывания" close={close}>
            <Form
                fields={[
                    { name: 'start', label: 'Начало укладывания', type: 'datetime-local', required: true },
                    ...(attempt.end_at
                        ? [{ name: 'end', label: 'Конец укладывания', type: 'datetime-local', required: true }]
                        : []),
                ]}
                initial={{
                    start: inputTime(attempt.start_at, day.timezone),
                    end: attempt.end_at ? inputTime(attempt.end_at, day.timezone) : '',
                }}
                submit={async (values) => {
                    await mutation.mutateAsync({
                        action: 'updateSettling',
                        key: attempt.id,
                        version: attempt.version,
                        values: {
                            start: absoluteTime(values.start, day.timezone),
                            end: values.end ? absoluteTime(values.end, day.timezone) : null,
                        },
                    });
                    close();
                }}
            />
        </Sheet>
    );
}
SettlingForm.propTypes = {
    attempt: PropTypes.object.isRequired,
    day: PropTypes.object.isRequired,
    close: PropTypes.func.isRequired,
};
