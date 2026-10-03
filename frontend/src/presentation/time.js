import { Temporal } from '@js-temporal/polyfill';

export function today(zone = 'Europe/Moscow') {
    return Temporal.Now.zonedDateTimeISO(zone).toPlainDate().toString();
}

export function dateShift(day, amount) {
    return Temporal.PlainDate.from(day).add({ days: amount }).toString();
}

export function inputTime(value, zone) {
    return Temporal.Instant.from(value).toZonedDateTimeISO(zone).toPlainDateTime().toString({ smallestUnit: 'minute' });
}

export function absoluteTime(value, zone) {
    return Temporal.PlainDateTime.from(value)
        .toZonedDateTime(zone, { disambiguation: 'reject' })
        .toInstant()
        .toString();
}

export function clockTime(value, zone) {
    if (!value) return '—';
    return new Intl.DateTimeFormat('ru', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(
        new Date(value),
    );
}

export function duration(seconds) {
    if (seconds === null || seconds === undefined) return '—';
    const minutes = Math.floor(seconds / 60);
    return `${Math.floor(minutes / 60)} ч ${minutes % 60} мин`;
}
