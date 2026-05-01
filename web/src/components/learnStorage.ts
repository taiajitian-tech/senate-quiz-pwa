import type { AppMode, Target } from "./data";
import { sanitizeProgressItem, type Grade, type ProgressItem } from "./srs";

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
    const parsed = JSON.parse(raw) as Record<string, Partial<ProgressItem>>;
    if (!parsed || typeof parsed !== "object") return {};

    const now = Date.now();
    const next: Record<number, ProgressItem> = {};
    for (const [idKey, value] of Object.entries(parsed)) {
      const id = Number(idKey);
      if (!Number.isFinite(id) || !value || typeof value !== "object") continue;
      next[id] = sanitizeProgressItem(id, value, now);
    }
    return next;
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
  localStorage.setItem(key(mode, target, "history"), JSON.stringify(list.slice(-2000)));
}


export type WrongMemoryItem = {
  id: number;
  missCount: number;
  lastMissAt: number;
};

export function loadWrongMemory(mode: AppMode, target: Target): WrongMemoryItem[] {
  try {
    const raw = localStorage.getItem(key(mode, target, "wrongMemory"));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): WrongMemoryItem | null => {
        if (!item || typeof item !== "object") return null;
        const id = Number((item as Partial<WrongMemoryItem>).id);
        const missCount = Number((item as Partial<WrongMemoryItem>).missCount);
        const lastMissAt = Number((item as Partial<WrongMemoryItem>).lastMissAt);
        if (!Number.isFinite(id)) return null;
        return {
          id: Math.trunc(id),
          missCount: Number.isFinite(missCount) ? Math.max(1, Math.trunc(missCount)) : 1,
          lastMissAt: Number.isFinite(lastMissAt) ? lastMissAt : 0,
        };
      })
      .filter((item): item is WrongMemoryItem => item !== null);
  } catch {
    return [];
  }
}

export function saveWrongMemory(mode: AppMode, target: Target, items: WrongMemoryItem[]) {
  localStorage.setItem(key(mode, target, "wrongMemory"), JSON.stringify(items));
}

export function rememberWrongMemory(mode: AppMode, target: Target, id: number, at: number) {
  const items = loadWrongMemory(mode, target);
  const next = items.some((item) => item.id === id)
    ? items.map((item) => item.id === id ? { ...item, missCount: item.missCount + 1, lastMissAt: at } : item)
    : [...items, { id, missCount: 1, lastMissAt: at }];
  saveWrongMemory(mode, target, next);
  return next;
}

export function clearWrongMemory(mode: AppMode, target: Target) {
  localStorage.removeItem(key(mode, target, "wrongMemory"));
}


export type FreshCycleState = {
  order: number[];
  cursor: number;
};

export function loadFreshCycle(mode: AppMode, target: Target): FreshCycleState | null {
  try {
    const raw = localStorage.getItem(key(mode, target, "freshCycle"));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FreshCycleState>;
    if (!parsed || !Array.isArray(parsed.order)) return null;
    const order = parsed.order.filter((id): id is number => Number.isFinite(id)).map((id) => Math.trunc(id));
    const cursor = Number.isFinite(parsed.cursor) ? Math.max(0, Math.trunc(parsed.cursor as number)) : 0;
    return { order, cursor: Math.min(cursor, order.length) };
  } catch {
    return null;
  }
}

export function saveFreshCycle(mode: AppMode, target: Target, state: FreshCycleState) {
  localStorage.setItem(key(mode, target, "freshCycle"), JSON.stringify(state));
}

export function clearFreshCycle(mode: AppMode, target: Target) {
  localStorage.removeItem(key(mode, target, "freshCycle"));
  localStorage.removeItem(key(mode, target, "wrongMemory"));
}

export function resetLearning(mode: AppMode, target: Target) {
  localStorage.removeItem(key(mode, target, "progress"));
  localStorage.removeItem(key(mode, target, "history"));
  localStorage.removeItem(key(mode, target, "wrongIds"));
  localStorage.removeItem(key(mode, target, "masteredIds"));
  localStorage.removeItem(key(mode, target, "stats"));
  localStorage.removeItem(key(mode, target, "freshCycle"));
  localStorage.removeItem(key(mode, target, "wrongMemory"));
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
