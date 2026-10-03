export type SleepKind = "night" | "nap";

export interface SleepRecord {
  id: string;
  kind: SleepKind;
  start: string;
  end: string | null;
}

export interface DaySettings {
  daytimeNapsCount: number;
  normalNapMin: number;
  normalWakeMin: number;
  targetTotalSleepMin: number;
  targetTotalWakeMin: number;
}

export interface AppState {
  version: number;
  settings: DaySettings;
  nightSleep: SleepRecord;
  naps: SleepRecord[];
}

export type SegmentStatus = "actual" | "ongoing" | "forecast";

export interface TimelineSegment {
  id: string;
  type: "sleep" | "wake";
  label: string;
  start: string;
  end: string;
  durationMin: number;
  status: SegmentStatus;
}

export interface Projection {
  timeline: TimelineSegment[];
  actualNightSleepMin: number;
  actualDaySleepMin: number;
  actualWakeMin: number;
  liveWakeMin: number;
  remainingSleepMin: number;
  remainingWakeMin: number;
  bedtime: string | null;
  warnings: string[];
  currentFocus: string;
}
