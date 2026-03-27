import type { AppMode, Target } from "./data";

const key = (mode: AppMode, target: Target, suffix: string) => `senateQuiz:${mode}:${target}:${suffix}:v1`;

const loadIds = (storageKey: string): number[] => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => Number.isFinite(x)).map((x) => Number(x));
  } catch {
    return [];
  }
};

const saveIds = (storageKey: string, ids: number[]) => {
  try {
    localStorage.setItem(storageKey, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

export const loadWrongIds = (mode: AppMode, target: Target) => loadIds(key(mode, target, "wrongIds"));
export const saveWrongIds = (mode: AppMode, target: Target, ids: number[]) => saveIds(key(mode, target, "wrongIds"), ids);

export const loadMasteredIds = (mode: AppMode, target: Target) => loadIds(key(mode, target, "masteredIds"));
export const saveMasteredIds = (mode: AppMode, target: Target, ids: number[]) => saveIds(key(mode, target, "masteredIds"), ids);
