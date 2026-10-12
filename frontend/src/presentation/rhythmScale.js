export function rhythmScale(rows) {
    const starts = [];
    const ends = [];
    const point = (value) => {
        if (Number.isFinite(value) && value >= 0 && value < 1440) {
            starts.push(value);
            ends.push(value);
        }
    };
    for (const row of rows) {
        point(row.morning);
        point(row.nightStart);
        point(row.settleStart);
        for (const [start, end] of ranges(row)) {
            if (!Number.isFinite(start) || start >= 1440 || (Number.isFinite(end) && end <= 0)) continue;
            starts.push(Math.max(0, start));
            if (Number.isFinite(end)) ends.push(Math.min(1440, end));
        }
    }
    const from = Math.max(0, Math.floor(((starts.length ? Math.min(...starts) : 360) - 30) / 30) * 30);
    const to = Math.min(1440, Math.ceil((Math.max(from + 120, ends.length ? Math.max(...ends) : 1200) + 30) / 30) * 30);
    return { from, to };
}

function ranges(row) {
    return [...row.naps, ...(row.nightWakings || []), ...(row.settlingRanges || [])];
}
