import type { Target } from "./data";

const key = (target: Target, suffix: string) => `senateQuiz:${target}:${suffix}:v1`;

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

export const loadWrongIds = (target: Target) => loadIds(key(target, "wrongIds"));
export const saveWrongIds = (target: Target, ids: number[]) => saveIds(key(target, "wrongIds"), ids);

export const loadMasteredIds = (target: Target) => loadIds(key(target, "masteredIds"));
export const saveMasteredIds = (target: Target, ids: number[]) => saveIds(key(target, "masteredIds"), ids);
