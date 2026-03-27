import type { AppMode, Target } from "./data";
import type { Grade, ProgressItem } from "./srs";

export type HistoryItem = {
  at: number;
  id: number;
  grade: Grade;
};

const key = (mode: AppMode, target: Target, suffix: string) => `senateQuiz:${mode}:${target}:${suffix}:v1`;

export function loadProgress(mode: AppMode, target: Target): Record<number, ProgressItem> {
  try {
    const raw = localStorage.getItem(key(mode, target, "progress"));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<number, ProgressItem>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgress(mode: AppMode, target: Target, map: Record<number, ProgressItem>) {
  localStorage.setItem(key(mode, target, "progress"), JSON.stringify(map));
}

export function loadHistory(mode: AppMode, target: Target): HistoryItem[] {
  try {
    const raw = localStorage.getItem(key(mode, target, "history"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(mode: AppMode, target: Target, item: HistoryItem) {
  const list = loadHistory(mode, target);
  list.push(item);
  localStorage.setItem(key(mode, target, "history"), JSON.stringify(list));
}

export function resetLearning(mode: AppMode, target: Target) {
  localStorage.removeItem(key(mode, target, "progress"));
  localStorage.removeItem(key(mode, target, "history"));
  localStorage.removeItem(key(mode, target, "wrongIds"));
  localStorage.removeItem(key(mode, target, "masteredIds"));
  localStorage.removeItem(key(mode, target, "stats"));
}

export function exportAllLearningData() {
  const snapshot: Record<string, unknown> = {};
  for (const storageKey of Object.keys(localStorage)) {
    if (storageKey.startsWith("senateQuiz:")) {
      const value = localStorage.getItem(storageKey);
      if (value !== null) snapshot[storageKey] = value;
    }
  }
  return JSON.stringify(snapshot, null, 2);
}

export function importAllLearningData(jsonText: string) {
  const parsed = JSON.parse(jsonText) as Record<string, string>;
  if (!parsed || typeof parsed !== "object") throw new Error("バックアップ形式が不正です。");
  for (const [k, v] of Object.entries(parsed)) {
    if (k.startsWith("senateQuiz:") && typeof v === "string") {
      localStorage.setItem(k, v);
    }
  }
}
