import { ListInput } from 'konsta/react';
import PropTypes from 'prop-types';
import { useId, useState } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from './Mobile.jsx';

const localErrors = {
    network_error: 'Нет соединения с сервером. Повторите запрос.',
    csrf_unavailable: 'Сессия ещё загружается. Подождите и повторите действие.',
    invalid_response: 'Не удалось прочитать ответ сервера. Обновите страницу.',
};

export function ErrorMessage({ error }) {
    if (!error) return null;
    const message =
        error.code === 'version_conflict'
            ? 'Данные изменились. Обновите экран и сверьте значения. Ваш ввод сохранён.'
            : localErrors[error.code] || error.message;
    return (
        <p role="alert" className="error">
            {message || 'Не удалось сохранить. Попробуйте ещё раз.'}
        </p>
    );
}
ErrorMessage.propTypes = { error: PropTypes.object };

export function Form({ fields, initial = {}, submit, label = 'Сохранить', disabled = false, children }) {
    const {
        register,
        resetField,
        handleSubmit,
        formState: { isSubmitting },
    } = useForm({
        defaultValues: Object.fromEntries(
            fields.filter((field) => field.name in initial).map((field) => [field.name, initial[field.name]]),
        ),
    });
    const [error, setError] = useState(null);
    const send = handleSubmit(async (values) => {
        if (disabled) return;
        setError(null);
        try {
            await submit(values);
        } catch (failure) {
            setError(failure);
        } finally {
            fields.filter((field) => field.type === 'password').forEach((field) => resetField(field.name));
        }
    });
    return (
        <form onSubmit={send} className="form-stack">
            {fields.map((field) => (
                <Field key={field.name} field={field} register={register} />
            ))}
            {children}
            <ErrorMessage error={error} />
            <Button type="submit" disabled={disabled || isSubmitting}>
                {isSubmitting ? 'Сохраняем…' : label}
            </Button>
        </form>
    );
}
Form.propTypes = {
    fields: PropTypes.array.isRequired,
    initial: PropTypes.object,
    submit: PropTypes.func.isRequired,
    label: PropTypes.string,
    disabled: PropTypes.bool,
    children: PropTypes.node,
};

export function Loading({ query, children }) {
    if (query.isPending) return <p role="status">Загружаем…</p>;
    if (query.isError)
        return (
            <div>
                <ErrorMessage error={query.error} />
                <Button type="button" onClick={() => query.refetch()}>
                    Повторить
                </Button>
            </div>
        );
    return children;
}
Loading.propTypes = { query: PropTypes.object.isRequired, children: PropTypes.node };

export function ActionButton({ action, children, confirm, className }) {
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const run = async () => {
        if (confirm && !window.confirm(confirm)) return;
        setBusy(true);
        setError(null);
        try {
            await action();
        } catch (failure) {
            setError(failure);
        } finally {
            setBusy(false);
        }
    };
    return (
        <>
            <Button type="button" className={className} onClick={run} disabled={busy}>
                {busy ? 'Подождите…' : children}
            </Button>
            <ErrorMessage error={error} />
        </>
    );
}
ActionButton.propTypes = {
    action: PropTypes.func.isRequired,
    children: PropTypes.node.isRequired,
    confirm: PropTypes.string,
    className: PropTypes.string,
};

export function confirmedVersion(original, current) {
    if (
        original !== current &&
        !window.confirm(
            'Запись изменена после открытия формы. Сверьте актуальные данные на экране. Применить ваш ввод к новой версии?',
        )
    ) {
        throw new Error('Изменения не сохранены. Ваш ввод остаётся в форме.');
    }
    return current;
}

function Field({ field, register }) {
    const id = useId();
    const { name, label, options, ...input } = field;
    return (
        <div className="mobile-field">
            <label htmlFor={id}>{label}</label>
            <ListInput
                component="div"
                inputId={id}
                {...register(name)}
                {...input}
                type={options ? 'select' : input.type || 'text'}
                outline={false}
                data-konsta="ListInput"
            >
                {options?.map(([value, text]) => (
                    <option key={value} value={value}>
                        {text}
                    </option>
                ))}
            </ListInput>
        </div>
    );
}
Field.propTypes = { field: PropTypes.object.isRequired, register: PropTypes.func.isRequired };
