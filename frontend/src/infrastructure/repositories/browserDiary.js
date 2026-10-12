import { reportWorkbook } from './reportWorkbook.js';

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
            const file = await reportWorkbook(report, command.values.notes !== false);
            signal?.throwIfAborted();
            this.browser.download(file, `tishe-${report.from}-${report.to}.xlsx`);
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
        const url = URL.createObjectURL(
            new Blob([value], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            }),
        );
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
