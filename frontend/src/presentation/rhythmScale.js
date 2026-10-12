export function rhythmScale(rows) {
    const starts = [];
    const ends = [];
    for (const row of rows) {
        if (Number.isFinite(row.morning)) starts.push(row.morning);
        if (Number.isFinite(row.nightStart)) {
            starts.push(row.nightStart);
            ends.push(row.nightStart);
        }
        for (const [start, end] of ranges(row)) {
            if (Number.isFinite(start)) starts.push(start);
            if (Number.isFinite(end)) ends.push(end);
        }
        if (Number.isFinite(row.settleStart)) {
            starts.push(row.settleStart);
            ends.push(row.settleStart);
        }
    }
    const from = Math.max(0, Math.floor(((starts.length ? Math.min(...starts) : 360) - 30) / 30) * 30);
    const to = Math.ceil((Math.max(from + 120, ends.length ? Math.max(...ends) : 1200) + 30) / 30) * 30;
    return { from, to };
}

function ranges(row) {
    return [...row.naps, ...(row.nightWakings || []), ...(row.settlingRanges || [])];
}
