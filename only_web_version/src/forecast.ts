import type { DaySettings, Projection, SleepRecord, TimelineSegment } from "./types";

const MINUTES_IN_HOUR = 60;

function toDate(value: string | null): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffMinutes(start: string, end: string): number {
  const startDate = toDate(start);
  const endDate = toDate(end);

  if (!startDate || !endDate) {
    return 0;
  }

  return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
}

function addMinutes(value: string, minutes: number): string {
  const base = toDate(value);

  if (!base) {
    return value;
  }

  base.setMinutes(base.getMinutes() + minutes);
  const offset = base.getTimezoneOffset();
  const local = new Date(base.getTime() - offset * 60000);
  return local.toISOString().slice(0, 16);
}

function allocateFixedDurations(count: number, preferred: number): number[] {
  if (count <= 0) {
    return [];
  }

  return Array(count).fill(Math.max(0, preferred));
}

function formatHoursMinutes(totalMin: number): string {
  const hours = Math.floor(totalMin / MINUTES_IN_HOUR);
  const minutes = totalMin % MINUTES_IN_HOUR;

  if (hours > 0 && minutes > 0) {
    return `${hours}ч ${minutes}м`;
  }

  if (hours > 0) {
    return `${hours}ч`;
  }

  return `${minutes}м`;
}

function formatClock(value: string): string {
  const date = toDate(value);

  if (!date) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function pushSegment(
  target: TimelineSegment[],
  segment: Omit<TimelineSegment, "durationMin">,
): void {
  target.push({
    ...segment,
    durationMin: diffMinutes(segment.start, segment.end),
  });
}

export function getDurationLabel(minutes: number): string {
  return formatHoursMinutes(minutes);
}

export function buildProjection(
  settings: DaySettings,
  nightSleep: SleepRecord,
  naps: SleepRecord[],
  now: Date = new Date(),
): Projection {
  const warnings: string[] = [];
  const timeline: TimelineSegment[] = [];
  const sortedNaps = [...naps]
    .filter((nap) => {
      if (nap.start) {
        return true;
      }

      if (nap.end) {
        warnings.push("Сон без времени начала пропущен из расчета.");
      }

      return false;
    })
    .sort((left, right) => left.start.localeCompare(right.start));
  const totalWakeWindows = settings.daytimeNapsCount + 1;

  if (!nightSleep.start || !nightSleep.end) {
    warnings.push("Нужно заполнить ночной сон полностью: начало и конец.");
  }

  const nightStart = toDate(nightSleep.start);
  const nightEnd = toDate(nightSleep.end);

  if (!nightStart || !nightEnd || nightEnd <= nightStart) {
    return {
      timeline,
      actualNightSleepMin: 0,
      actualDaySleepMin: 0,
      actualWakeMin: 0,
      liveWakeMin: 0,
      remainingSleepMin: settings.targetTotalSleepMin,
      remainingWakeMin: settings.targetTotalWakeMin,
      bedtime: null,
      warnings: warnings.length > 0 ? warnings : ["Ночной сон заполнен некорректно."],
      currentFocus: "Сначала внесите корректный ночной сон.",
    };
  }

  const safeNightStart = nightSleep.start;
  const safeNightEnd = nightSleep.end!;

  pushSegment(timeline, {
    id: nightSleep.id,
    type: "sleep",
    label: "Ночной сон",
    start: safeNightStart,
    end: safeNightEnd,
    status: "actual",
  });

  const actualNightSleepMin = diffMinutes(safeNightStart, safeNightEnd);
  let actualDaySleepMin = 0;
  let actualWakeMin = 0;
  let liveWakeMin = 0;
  let cursor = safeNightEnd;
  let completedNaps = 0;
  let openNap: SleepRecord | undefined;

  for (const [index, nap] of sortedNaps.entries()) {
    if (openNap) {
      warnings.push("Открытый сон должен быть последним событием дня.");
      continue;
    }

    const napStartDate = toDate(nap.start);

    if (!napStartDate) {
      warnings.push(`Сон ${index + 1} имеет некорректное время начала.`);
      continue;
    }

    const wakeMinutes = diffMinutes(cursor, nap.start);
    if (toDate(cursor)! > napStartDate) {
      warnings.push(`Сон ${index + 1} начинается раньше окончания предыдущего периода.`);
      continue;
    }

    pushSegment(timeline, {
      id: `wake-${nap.id}`,
      type: "wake",
      label: `Бодрствование ${index + 1}`,
      start: cursor,
      end: nap.start,
      status: "actual",
    });
    actualWakeMin += wakeMinutes;

    if (!nap.end) {
      openNap = nap;
      continue;
    }

    const napEndDate = toDate(nap.end);
    if (!napEndDate || napEndDate <= napStartDate) {
      warnings.push(`Сон ${index + 1} заполнен некорректно.`);
      continue;
    }

    pushSegment(timeline, {
      id: nap.id,
      type: "sleep",
      label: `Сон ${index + 1}`,
      start: nap.start,
      end: nap.end,
      status: "actual",
    });
    actualDaySleepMin += diffMinutes(nap.start, nap.end);
    completedNaps += 1;
    cursor = nap.end;
  }

  const napsStarted = sortedNaps.length;
  const napsRemaining = Math.max(0, settings.daytimeNapsCount - completedNaps);
  const wakeWindowsRemaining = Math.max(0, totalWakeWindows - napsStarted);
  const rawRemainingSleep = settings.targetTotalSleepMin - actualNightSleepMin - actualDaySleepMin;
  let rawRemainingWake = settings.targetTotalWakeMin - actualWakeMin;
  const remainingSleepMin = Math.max(0, rawRemainingSleep);
  let remainingWakeMin = Math.max(0, rawRemainingWake);

  if (sortedNaps.length > settings.daytimeNapsCount) {
    warnings.push("Фактических дневных снов больше, чем настроено в плане дня.");
  }

  if (rawRemainingSleep < 0) {
    warnings.push("Цель по общему сну уже превышена. Прогноз дальше строится по нормам сна.");
  }

  if (rawRemainingWake < 0) {
    warnings.push("Цель по суммарному бодрствованию уже превышена. Прогноз дальше строится по нормам бодрствования.");
  }

  const sleepDurations = allocateFixedDurations(napsRemaining, settings.normalNapMin);
  const wakeDurations = allocateFixedDurations(wakeWindowsRemaining, settings.normalWakeMin);

  if (openNap) {
    const currentNapDuration = sleepDurations[0] ?? 0;
    const currentNapEnd = addMinutes(openNap.start, currentNapDuration);
    pushSegment(timeline, {
      id: openNap.id,
      type: "sleep",
      label: `Сон ${completedNaps + 1}`,
      start: openNap.start,
      end: currentNapEnd,
      status: "ongoing",
    });

    let forecastCursor = currentNapEnd;
    const futureSleepDurations = sleepDurations.slice(1);

    futureSleepDurations.forEach((sleepMinutes, index) => {
      const wakeMinutes = wakeDurations[index] ?? 0;
      const wakeEnd = addMinutes(forecastCursor, wakeMinutes);
      pushSegment(timeline, {
        id: `forecast-wake-${index + 1}`,
        type: "wake",
        label: `Бодрствование ${completedNaps + index + 2}`,
        start: forecastCursor,
        end: wakeEnd,
        status: index === 0 ? "forecast" : "forecast",
      });
      const napEnd = addMinutes(wakeEnd, sleepMinutes);
      pushSegment(timeline, {
        id: `forecast-sleep-${index + 1}`,
        type: "sleep",
        label: `Сон ${completedNaps + index + 2}`,
        start: wakeEnd,
        end: napEnd,
        status: "forecast",
      });
      forecastCursor = napEnd;
    });

    const finalWakeOffset = futureSleepDurations.length;
    const finalWakeMinutes = wakeDurations[finalWakeOffset] ?? 0;
    const bedtime = addMinutes(forecastCursor, finalWakeMinutes);

    if (finalWakeMinutes > 0) {
      pushSegment(timeline, {
        id: "forecast-final-wake",
        type: "wake",
        label: `Бодрствование ${settings.daytimeNapsCount + 1}`,
        start: forecastCursor,
        end: bedtime,
        status: "forecast",
      });
    }

    return {
      timeline,
      actualNightSleepMin,
      actualDaySleepMin,
      actualWakeMin,
      liveWakeMin: actualWakeMin,
      remainingSleepMin,
      remainingWakeMin,
      bedtime,
      warnings,
      currentFocus: `Ребенок сейчас спит. Прогнозируемый подъем в ${formatClock(
        currentNapEnd,
      )}.`,
    };
  }

  let forecastCursor = cursor;
  let bedtime: string | null = cursor;

  if (wakeDurations.length > 0) {
    const currentWakeStart = forecastCursor;
    const currentWakeEnd = addMinutes(forecastCursor, wakeDurations[0]);
    pushSegment(timeline, {
      id: "current-wake",
      type: "wake",
      label: `Бодрствование ${completedNaps + 1}`,
      start: forecastCursor,
      end: currentWakeEnd,
      status: "ongoing",
    });
    const nowOffsetMin = Math.max(0, diffMinutes(currentWakeStart, now.toISOString()));
    liveWakeMin = actualWakeMin + nowOffsetMin;
    rawRemainingWake = settings.targetTotalWakeMin - liveWakeMin;
    remainingWakeMin = Math.max(0, rawRemainingWake);
    forecastCursor = currentWakeEnd;
    bedtime = currentWakeEnd;
  } else {
    liveWakeMin = actualWakeMin;
  }

  sleepDurations.forEach((sleepMinutes, index) => {
    const napNumber = completedNaps + index + 1;
    const napEnd = addMinutes(forecastCursor, sleepMinutes);
    pushSegment(timeline, {
      id: `future-nap-${napNumber}`,
      type: "sleep",
      label: `Сон ${napNumber}`,
      start: forecastCursor,
      end: napEnd,
      status: "forecast",
    });
    forecastCursor = napEnd;

    const wakeMinutes = wakeDurations[index + 1] ?? 0;
    const wakeEnd = addMinutes(forecastCursor, wakeMinutes);
    bedtime = wakeEnd;

    if (wakeMinutes > 0) {
      pushSegment(timeline, {
        id: `future-wake-${napNumber + 1}`,
        type: "wake",
        label: `Бодрствование ${napNumber + 1}`,
        start: forecastCursor,
        end: wakeEnd,
        status: index === sleepDurations.length - 1 ? "forecast" : "forecast",
      });
    }

    forecastCursor = wakeEnd;
  });

  if (sleepDurations.length === 0 && wakeDurations.length === 0) {
    bedtime = cursor;
  }

  const nextWakeMinutes = wakeDurations[0] ?? 0;
  const nextAction =
    completedNaps >= settings.daytimeNapsCount
      ? "Дневные сны завершены, идет финальное бодрствование до ночного укладывания."
      : `Следующее укладывание в ${formatClock(addMinutes(cursor, nextWakeMinutes))}.`;

  return {
    timeline,
    actualNightSleepMin,
    actualDaySleepMin,
    actualWakeMin,
    liveWakeMin,
    remainingSleepMin,
    remainingWakeMin,
    bedtime,
    warnings,
    currentFocus: nextAction,
  };
}
