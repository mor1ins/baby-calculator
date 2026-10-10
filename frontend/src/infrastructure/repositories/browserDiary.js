function csvCell(value) {
    const text = String(value ?? '');
    return `"${(/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}

export function reportCsv(report, notes) {
    const rows = [['cycle_date', 'timezone', 'type', 'start', 'end', 'duration_minutes', ...(notes ? ['note'] : [])]];
    for (const day of report.rows) {
        for (const sleep of day.sleeps) {
            const note = day.timeline.find((entry) => entry.sleep_id === sleep.id)?.comment?.text || '';
            rows.push([
                day.date,
                day.timezone,
                sleep.kind,
                sleep.start,
                sleep.end,
                sleep.end ? (Date.parse(sleep.end) - Date.parse(sleep.start)) / 60000 : '',
                ...(notes ? [note] : []),
            ]);
        }
    }
    return '\uFEFF' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
}

export class BrowserDiaryRepository {
    constructor(diary, browser) {
        this.diary = diary;
        this.browser = browser;
    }
    async execute(command, signal) {
        if (command.action === 'preparePhoto') return this.browser.photo(command.values.file);
        if (command.action === 'copyShare') return this.browser.copy(`${this.browser.origin}/s/${command.key}`);
        if (command.action === 'exportReport') {
            const report =
                command.values.report ||
                (await this.diary.execute({ action: 'report', values: command.values.period }, signal));
            signal?.throwIfAborted();
            this.browser.download(
                reportCsv(report, command.values.notes === true),
                `tishe-${report.from}-${report.to}.csv`,
            );
            return null;
        }
        return this.diary.execute(command, signal);
    }
}

export const browserFiles = {
    get origin() {
        return window.location.origin;
    },
    copy: (value) => navigator.clipboard.writeText(value),
    download(value, name) {
        const url = URL.createObjectURL(new Blob([value], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = name;
        anchor.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    async photo(file) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024)
            throw new Error('Выберите JPG, PNG или WebP до 5 МБ');
        const bitmap = await createImageBitmap(file);
        try {
            const canvas = document.createElement('canvas');
            const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return canvas.toDataURL('image/jpeg', 0.8);
        } finally {
            bitmap.close();
        }
    },
};
