import { useEffect, useMemo, useState } from "react";
import { buildProjection, getDurationLabel } from "./forecast";
import { DEFAULT_SETTINGS, DEMO_STATE, STORAGE_KEY } from "./sample";
import type { AppState, DaySettings, SleepRecord } from "./types";

function createId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function createInitialState(): AppState {
  return {
    version: 1,
    settings: DEFAULT_SETTINGS,
    nightSleep: {
      id: createId("night"),
      kind: "night",
      start: "",
      end: "",
    },
    naps: [],
  };
}

function loadState(): AppState {
  const initialState = createInitialState();
  const raw = window.localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return initialState;
  }

  try {
    const parsed = JSON.parse(raw) as AppState;
    if (parsed.version !== 1) {
      return initialState;
    }

    return {
      ...initialState,
      ...parsed,
      settings: {
        ...DEFAULT_SETTINGS,
        ...parsed.settings,
      },
      nightSleep: {
        ...initialState.nightSleep,
        ...parsed.nightSleep,
        kind: "night",
      },
      naps: Array.isArray(parsed.naps)
        ? parsed.naps.map((nap) => ({
            ...nap,
            kind: "nap",
          }))
        : [],
    };
  } catch {
    return initialState;
  }
}

function toLocalInputValue(value: string | null): string {
  return value ?? "";
}

function formatClock(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--:--";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function clampNumber(value: number, min: number, max?: number): number {
  const lowerBound = Math.max(min, value);

  if (typeof max === "number") {
    return Math.min(lowerBound, max);
  }

  return lowerBound;
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <article className="stat-card">
      <span className="stat-card__label">{label}</span>
      <strong className="stat-card__value">{value}</strong>
      {hint ? <span className="stat-card__hint">{hint}</span> : null}
    </article>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max?: number;
  step?: number;
  onChange: (nextValue: number) => void;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    if (!isEditing) {
      setDraft(String(value));
    }
  }, [isEditing, value]);

  const commitValue = (rawValue: string) => {
    const normalized = rawValue.trim();

    if (normalized === "") {
      const fallback = clampNumber(value, min, max);
      setDraft(String(fallback));
      onChange(fallback);
      return;
    }

    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }

    const clamped = clampNumber(parsed, min, max);
    setDraft(String(clamped));
    onChange(clamped);
  };

  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__control"
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={draft}
        onFocus={() => setIsEditing(true)}
        onBlur={() => {
          setIsEditing(false);
          commitValue(draft);
        }}
        onChange={(event) => {
          const nextValue = event.target.value;

          if (!/^\d*$/.test(nextValue)) {
            return;
          }

          setDraft(nextValue);

          if (nextValue === "") {
            return;
          }

          const parsed = Number(nextValue);
          if (!Number.isFinite(parsed)) {
            return;
          }

          onChange(clampNumber(parsed, min, max));
        }}
      />
    </label>
  );
}

function DateTimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string | null;
  onChange: (nextValue: string | null) => void;
}) {
  return (
    <label className="field">
      <span className="field__label">{label}</span>
      <input
        className="field__control"
        type="datetime-local"
        value={toLocalInputValue(value)}
        onChange={(event) => onChange(event.target.value || null)}
      />
    </label>
  );
}

export default function App() {
  const [state, setState] = useState<AppState>(() => loadState());
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 60000);

    return () => window.clearInterval(timer);
  }, []);

  const projection = useMemo(
    () => buildProjection(state.settings, state.nightSleep, state.naps, now),
    [now, state],
  );

  const updateSettings = <Key extends keyof DaySettings>(key: Key, value: DaySettings[Key]) => {
    setState((current) => ({
      ...current,
      settings: {
        ...current.settings,
        [key]: value,
      },
    }));
  };

  const updateNightSleep = (key: "start" | "end", value: string | null) => {
    setState((current) => ({
      ...current,
      nightSleep: {
        ...current.nightSleep,
        [key]: value ?? "",
      },
    }));
  };

  const updateNap = (id: string, key: "start" | "end", value: string | null) => {
    setState((current) => ({
      ...current,
      naps: current.naps.map((nap) =>
        nap.id === id
          ? {
              ...nap,
              [key]: key === "start" ? value ?? "" : value,
            }
          : nap,
      ),
    }));
  };

  const addNap = () => {
    setState((current) => ({
      ...current,
      naps: [
        ...current.naps,
        {
          id: createId("nap"),
          kind: "nap",
          start: "",
          end: null,
        },
      ],
    }));
  };

  const deleteNap = (id: string) => {
    setState((current) => ({
      ...current,
      naps: current.naps.filter((nap) => nap.id !== id),
    }));
  };

  const resetState = () => {
    setState(createInitialState());
  };

  const loadDemo = () => {
    setState({
      ...DEMO_STATE,
      nightSleep: {
        ...DEMO_STATE.nightSleep,
      },
      naps: DEMO_STATE.naps.map((nap) => ({ ...nap })),
    });
  };

  const napsLimitReached = state.naps.length >= state.settings.daytimeNapsCount;

  return (
    <div className="app-shell">
      <div className="ambient ambient--top" />
      <div className="ambient ambient--bottom" />

      <main className="app">
        <section className="hero card card--hero">
          <div className="hero__content">
            <span className="eyebrow">Baby Sleep Calculator</span>
            <h1>Калькулятор сна</h1>
            <p>
              Вноси ночной сон и фактические дневные сны, а приложение само
              пересчитает окна бодрствования, оставшиеся сны и время отхода ко сну.
            </p>
          </div>

          <div className="hero__actions">
            <button className="button button--primary" onClick={loadDemo} type="button">
              Загрузить демо
            </button>
            <button className="button button--ghost" onClick={resetState} type="button">
              Очистить день
            </button>
          </div>
        </section>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Текущий прогноз</span>
              <h2>{projection.currentFocus}</h2>
            </div>
            <div className="bedtime-pill">
              <span>Ночной сон</span>
              <strong>
                {projection.bedtime ? formatClock(projection.bedtime) : "--:--"}
              </strong>
            </div>
          </div>

          <div className="stats-grid">
            <StatCard
              label="Ночной сон"
              value={getDurationLabel(projection.actualNightSleepMin)}
              hint={`цель дня ${getDurationLabel(state.settings.targetTotalSleepMin)}`}
            />
            <StatCard
              label="Дневной сон"
              value={getDurationLabel(projection.actualDaySleepMin)}
              hint={`остаток ${getDurationLabel(projection.remainingSleepMin)}`}
            />
            <StatCard
              label="Бодрствование"
              value={getDurationLabel(projection.liveWakeMin)}
              hint={`остаток ${getDurationLabel(projection.remainingWakeMin)}`}
            />
            <StatCard
              label="Дневных снов"
              value={`${state.naps.length}/${state.settings.daytimeNapsCount}`}
              hint={`окон бодрствования ${state.settings.daytimeNapsCount + 1}`}
            />
          </div>

          {projection.warnings.length > 0 ? (
            <div className="notice-list">
              {projection.warnings.map((warning) => (
                <p className="notice" key={warning}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </section>

        <div className="layout-grid">
          <section className="card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Настройки дня</span>
                <h2>Нормы и цели</h2>
              </div>
            </div>

            <div className="fields-grid">
              <NumberField
                label="Дневных снов"
                min={0}
                max={6}
                value={state.settings.daytimeNapsCount}
                onChange={(value) => updateSettings("daytimeNapsCount", Math.max(0, value))}
              />
              <NumberField
                label="Нормальный сон, мин"
                min={0}
                max={300}
                value={state.settings.normalNapMin}
                onChange={(value) => updateSettings("normalNapMin", Math.max(0, value))}
              />
              <NumberField
                label="Нормальное бодрствование, мин"
                min={0}
                max={480}
                value={state.settings.normalWakeMin}
                onChange={(value) => updateSettings("normalWakeMin", Math.max(0, value))}
              />
              <NumberField
                label="Суммарный сон за сутки, мин"
                min={0}
                max={1440}
                value={state.settings.targetTotalSleepMin}
                onChange={(value) => updateSettings("targetTotalSleepMin", Math.max(0, value))}
              />
              <NumberField
                label="Суммарное бодрствование, мин"
                min={0}
                max={1440}
                value={state.settings.targetTotalWakeMin}
                onChange={(value) => updateSettings("targetTotalWakeMin", Math.max(0, value))}
              />
            </div>
          </section>

          <section className="card">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Фактические события</span>
                <h2>Ночной сон и дневные сны</h2>
              </div>
            </div>

            <div className="event-stack">
              <article className="event-card event-card--night">
                <div className="event-card__head">
                  <div>
                    <span className="event-card__eyebrow">Обязательное событие</span>
                    <h3>Ночной сон</h3>
                  </div>
                  <span className="event-card__duration">
                    {projection.actualNightSleepMin > 0
                      ? getDurationLabel(projection.actualNightSleepMin)
                      : "—"}
                  </span>
                </div>

                <div className="fields-grid">
                  <DateTimeField
                    label="Уснул"
                    value={state.nightSleep.start}
                    onChange={(value) => updateNightSleep("start", value)}
                  />
                  <DateTimeField
                    label="Проснулся"
                    value={state.nightSleep.end}
                    onChange={(value) => updateNightSleep("end", value)}
                  />
                </div>
              </article>

              {state.naps.map((nap, index) => {
                const duration =
                  nap.start && nap.end ? getDurationLabel(buildNapDuration(nap)) : "в процессе";

                return (
                  <article className="event-card" key={nap.id}>
                    <div className="event-card__head">
                      <div>
                        <span className="event-card__eyebrow">Дневной сон</span>
                        <h3>Сон {index + 1}</h3>
                      </div>
                      <div className="event-card__actions">
                        <span className="event-card__duration">{duration}</span>
                        <button
                          className="icon-button"
                          onClick={() => deleteNap(nap.id)}
                          type="button"
                        >
                          Удалить
                        </button>
                      </div>
                    </div>

                    <div className="fields-grid">
                      <DateTimeField
                        label="Уснул"
                        value={nap.start}
                        onChange={(value) => updateNap(nap.id, "start", value)}
                      />
                      <DateTimeField
                        label="Проснулся"
                        value={nap.end}
                        onChange={(value) => updateNap(nap.id, "end", value)}
                      />
                    </div>
                  </article>
                );
              })}
            </div>

            <button
              className="button button--secondary"
              onClick={addNap}
              type="button"
              disabled={napsLimitReached}
            >
              {napsLimitReached ? "Лимит дневных снов достигнут" : "Добавить дневной сон"}
            </button>
          </section>
        </div>

        <section className="card">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Лента дня</span>
              <h2>Факт и прогноз</h2>
            </div>
          </div>

          <div className="timeline">
            {projection.timeline.map((segment) => (
              <article
                className={`timeline-item timeline-item--${segment.type}`}
                key={segment.id}
              >
                <div className="timeline-item__header">
                  <span className={`status-badge status-badge--${segment.status}`}>
                    {segment.status === "actual"
                      ? "Факт"
                      : segment.status === "ongoing"
                        ? "Сейчас"
                        : "Прогноз"}
                  </span>
                  <strong>{segment.label}</strong>
                  <span className="timeline-item__duration">
                    {getDurationLabel(segment.durationMin)}
                  </span>
                </div>
                <div className="timeline-item__time">
                  <span>{formatDateTime(segment.start)}</span>
                  <span>{formatDateTime(segment.end)}</span>
                </div>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function buildNapDuration(nap: SleepRecord): number {
  const start = new Date(nap.start).getTime();
  const end = nap.end ? new Date(nap.end).getTime() : Number.NaN;

  if (Number.isNaN(start) || Number.isNaN(end)) {
    return 0;
  }

  return Math.max(0, Math.round((end - start) / 60000));
}
