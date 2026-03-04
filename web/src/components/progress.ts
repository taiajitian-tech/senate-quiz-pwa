export const WRONG_IDS_KEY = "senateQuizWrongIds.v1";
export const MASTERED_IDS_KEY = "senateQuizMasteredIds.v1";

const loadIds = (key: string): number[] => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x) => Number.isFinite(x)).map((x) => Number(x));
  } catch {
    return [];
  }
};

const saveIds = (key: string, ids: number[]) => {
  try {
    localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    // ignore
  }
};

export const loadWrongIds = () => loadIds(WRONG_IDS_KEY);
export const saveWrongIds = (ids: number[]) => saveIds(WRONG_IDS_KEY, ids);

export const loadMasteredIds = () => loadIds(MASTERED_IDS_KEY);
export const saveMasteredIds = (ids: number[]) => saveIds(MASTERED_IDS_KEY, ids);
