export type Options = {
  quizCount: number;
  faceSeconds: number;
  answerSeconds: number;
};

const OPTIONS_KEY = "senateQuizOptions.v2";

export const loadOptions = (): Options => {
  try {
    const raw = localStorage.getItem(OPTIONS_KEY);
    if (!raw) return { quizCount: 20, faceSeconds: 2, answerSeconds: 2 };
    const parsed = JSON.parse(raw) as Partial<Options>;
    const quizCount = Number.isFinite(Number(parsed.quizCount))
      ? Math.max(10, Math.min(200, Math.round(Number(parsed.quizCount) / 10) * 10))
      : 20;
    const faceSeconds = Number.isFinite(Number(parsed.faceSeconds))
      ? Math.max(1, Math.min(10, Math.round(Number(parsed.faceSeconds))))
      : 2;
    const answerSeconds = Number.isFinite(Number(parsed.answerSeconds))
      ? Math.max(1, Math.min(10, Math.round(Number(parsed.answerSeconds))))
      : 2;
    return { quizCount, faceSeconds, answerSeconds };
  } catch {
    return { quizCount: 20, faceSeconds: 2, answerSeconds: 2 };
  }
};

export const saveOptions = (v: Options) => {
  try {
    localStorage.setItem(OPTIONS_KEY, JSON.stringify(v));
  } catch {
    // ignore
  }
};
