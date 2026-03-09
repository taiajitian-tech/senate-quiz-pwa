export type Options = {
  quizCount: number;
};

const OPTIONS_KEY = "senateQuizOptions.v1";

export const loadOptions = (): Options => {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { quizCount: 20 };
    const parsed = JSON.parse(raw) as Partial<Options>;
    const n = Number(parsed.quizCount);
    if (!Number.isFinite(n)) return { quizCount: 20 };
    const fixed = Math.max(10, Math.min(200, Math.round(n / 10) * 10));
    return { quizCount: fixed };
  } catch {
    return { quizCount: 20 };
  }
};

export const saveOptions = (v: Options) => {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
};
