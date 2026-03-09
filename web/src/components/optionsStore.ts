export type Options = {
  quizCount: number;
  autoFaceSeconds: number;
  autoAnswerSeconds: number;
};

const OPTIONS_KEY = "senateQuizOptions.v2";

const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));

export const loadOptions = (): Options => {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { quizCount: 20, autoFaceSeconds: 2, autoAnswerSeconds: 2 };
    const parsed = JSON.parse(raw) as Partial<Options>;
    const quizCount = clamp(Math.round((Number(parsed.quizCount) || 20) / 10) * 10, 10, 200);
    const autoFaceSeconds = clamp(Number(parsed.autoFaceSeconds) || 2, 1, 10);
    const autoAnswerSeconds = clamp(Number(parsed.autoAnswerSeconds) || 2, 1, 10);
    return { quizCount, autoFaceSeconds, autoAnswerSeconds };
  } catch {
    return { quizCount: 20, autoFaceSeconds: 2, autoAnswerSeconds: 2 };
  }
};

export const saveOptions = (v: Options) => {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
};
