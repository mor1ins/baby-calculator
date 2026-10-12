import ExcelJS from 'exceljs';

const label = (date) => date.split('-').reverse().join('.');
const fills = Object.fromEntries(
    Object.entries({ night: 'FF93CCEA', nap: 'FFF9C6A1', awake: 'FFF2F2F2' }).map(([kind, argb]) => [
        kind,
        { type: 'pattern', pattern: 'solid', fgColor: { argb } },
    ]),
);

function intervalText(entry, zone, notes) {
    const clock = (value) =>
        new Intl.DateTimeFormat('ru', {
            timeZone: zone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).format(new Date(value));
    const title = { night: 'Ночной сон\n', nap: 'Дневной сон\n', awake: '' }[entry.kind];
    const minutes = Math.floor(entry.duration_seconds / 60);
    const duration = `${minutes >= 60 ? `${Math.floor(minutes / 60)}ч ` : ''}${minutes % 60}м`;
    const time = entry.end ? `${clock(entry.start)} - ${clock(entry.end)} /${duration}/` : `${clock(entry.start)} - …`;
    return `${title}${time}${notes && entry.comment?.text ? `\n${entry.comment.text}` : ''}`;
}

function textBlocks(item) {
    const blocks = [];
    let text = '';
    let lines = 0;
    for (const paragraph of item.text.split('\n')) {
        const parts = paragraph.match(/.{1,580}/gu) || [''];
        for (const part of parts) {
            const height = Math.max(1, Math.ceil(part.length / 29));
            if (lines + height > 24) {
                blocks.push({ ...item, text });
                text = '';
                lines = 0;
            }
            text += `${lines ? '\n' : ''}${part}`;
            lines += height;
        }
    }
    return [...blocks, { ...item, text }];
}

export async function reportWorkbook(report, notes = true) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(`${label(report.from)} - ${label(report.to)}`);
    sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    sheet.getColumn(1).width = 13;
    sheet.getCell('A1').value = 'Дата';
    const byDate = new Map((report.export_days || report.rows).map((day) => [day.date, day]));
    let column = 2;
    for (let stamp = Date.parse(report.from); stamp <= Date.parse(report.to); stamp += 86400000) {
        const date = new Date(stamp).toISOString().slice(0, 10);
        const day = byDate.get(date);
        sheet.getColumn(column).width = 31;
        const header = sheet.getCell(1, column);
        header.value = new Date(stamp);
        header.numFmt = 'dd\\.mm\\.yyyy';
        const entries = day?.timeline.filter((entry) => entry.status !== 'forecast') || [];
        const cells = entries.map((entry) => ({ text: intervalText(entry, day.timezone, notes), kind: entry.kind }));
        if (notes && day?.notes?.length) cells.push({ text: `Заметки\n${day.notes.join('\n')}`, kind: 'awake' });
        cells.flatMap(textBlocks).forEach((item, index) => {
            const cell = sheet.getCell(index + 3, column);
            cell.value = item.text;
            cell.fill = fills[item.kind];
            cell.alignment = { vertical: 'top', wrapText: true };
            const lines = cell.value
                .split('\n')
                .reduce((count, line) => count + Math.max(1, Math.ceil(line.length / 29)), 0);
            const row = sheet.getRow(index + 3);
            row.height = Math.max(row.height || 0, Math.min(409, lines * 15 + 8));
        });
        column += 1;
    }
    sheet.eachRow((row) =>
        row.eachCell((cell) => {
            cell.font = { name: 'Calibri', size: 11 };
        }),
    );
    return workbook.xlsx.writeBuffer();
}
