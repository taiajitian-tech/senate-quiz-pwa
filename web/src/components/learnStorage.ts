import type { Grade, ProgressItem } from "./srs";

export type HistoryItem = {
  at: number;
  id: number;
  grade: Grade;
};

const PROGRESS_KEY = "senateQuiz:progress:v1";
const HISTORY_KEY = "senateQuiz:history:v1";

export function loadProgress(): Record<number, ProgressItem> {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<number, ProgressItem>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function saveProgress(map: Record<number, ProgressItem>) {
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(map));
}

export function loadHistory(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as HistoryItem[]) : [];
  } catch {
    return [];
  }
}

export function appendHistory(item: HistoryItem) {
  const list = loadHistory();
  list.push(item);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(list));
}

export function resetLearning() {
  localStorage.removeItem(PROGRESS_KEY);
  localStorage.removeItem(HISTORY_KEY);
}
