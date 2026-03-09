import type { TargetKey } from "./data";
import type { Grade, ProgressItem } from "./srs";

export type HistoryItem = {
  at: number;
  id: number;
  grade: Grade;
};

const progressKey = (target: TargetKey) => `memorize:${target}:progress:v1`;
const historyKey = (target: TargetKey) => `memorize:${target}:history:v1`;

export function loadProgress(target: TargetKey): Record<number, ProgressItem> {
  try {
    const raw = localStorage.getItem(progressKey(target));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<number, ProgressItem>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgress(target: TargetKey, map: Record<number, ProgressItem>) {
  localStorage.setItem(progressKey(target), JSON.stringify(map));
}

export function loadHistory(target: TargetKey): HistoryItem[] {
  try {
    const raw = localStorage.getItem(historyKey(target));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(target: TargetKey, item: HistoryItem) {
  const list = loadHistory(target);
  list.push(item);
  localStorage.setItem(historyKey(target), JSON.stringify(list));
}

export function resetLearning(target: TargetKey) {
  localStorage.removeItem(progressKey(target));
  localStorage.removeItem(historyKey(target));
}

export function exportAllLearningData() {
  const data: Record<string, unknown> = {};
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("memorize:") || key.startsWith("senateQuiz") || key === "app-first-launch") {
      try {
        data[key] = JSON.parse(localStorage.getItem(key) ?? "null");
      } catch {
        data[key] = localStorage.getItem(key);
      }
    }
  }
  return data;
}

export function importAllLearningData(value: Record<string, unknown>) {
  for (const [key, item] of Object.entries(value)) {
    localStorage.setItem(key, typeof item === "string" ? item : JSON.stringify(item));
  }
}
