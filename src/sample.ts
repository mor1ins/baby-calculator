import type { AppState } from "./types";

export const STORAGE_KEY = "baby-calculator:v1";

export const DEFAULT_SETTINGS = {
  daytimeNapsCount: 3,
  normalNapMin: 70,
  normalWakeMin: 150,
  targetTotalSleepMin: 840,
  targetTotalWakeMin: 600,
};

export const DEMO_STATE: AppState = {
  version: 1,
  settings: DEFAULT_SETTINGS,
  nightSleep: {
    id: "night-demo",
    kind: "night",
    start: "2026-04-05T21:30",
    end: "2026-04-06T08:00",
  },
  naps: [
    {
      id: "nap-demo-1",
      kind: "nap",
      start: "2026-04-06T10:45",
      end: "2026-04-06T11:25",
    },
  ],
};
