import PropTypes from 'prop-types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';

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

export function Form({ fields, initial = {}, submit, label = 'Сохранить', children }) {
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
            {fields.map(({ name, label: title, options, ...input }) => (
                <label key={name}>
                    <span>{title}</span>
                    {options ? (
                        <select {...register(name)} {...input}>
                            {options.map(([value, text]) => (
                                <option key={value} value={value}>
                                    {text}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input {...register(name)} {...input} />
                    )}
                </label>
            ))}
            {children}
            <ErrorMessage error={error} />
            <button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Сохраняем…' : label}
            </button>
        </form>
    );
}
Form.propTypes = {
    fields: PropTypes.array.isRequired,
    initial: PropTypes.object,
    submit: PropTypes.func.isRequired,
    label: PropTypes.string,
    children: PropTypes.node,
};

export function Loading({ query, children }) {
    if (query.isPending) return <p role="status">Загружаем…</p>;
    if (query.isError)
        return (
            <div>
                <ErrorMessage error={query.error} />
                <button type="button" onClick={() => query.refetch()}>
                    Повторить
                </button>
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
            <button type="button" className={className} onClick={run} disabled={busy}>
                {busy ? 'Подождите…' : children}
            </button>
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
