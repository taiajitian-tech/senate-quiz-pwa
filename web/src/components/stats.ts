export type Stats = {
  playedTotal: number;
  correctTotal: number;
  wrongTotal: number;
  masteredCount: number;
};

const STATS_KEY = "senateQuizStats.v1";

const cleanNum = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
};

export const loadStats = (): Stats => {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0 };
    const p = JSON.parse(raw) as Partial<Stats>;
    return {
      playedTotal: cleanNum(p.playedTotal),
      correctTotal: cleanNum(p.correctTotal),
      wrongTotal: cleanNum(p.wrongTotal),
      masteredCount: cleanNum(p.masteredCount),
    };
  } catch {
    return { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0 };
  }
};

export const saveStats = (s: Stats) => {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const bumpStats = (delta: Partial<Stats>) => {
  const s = loadStats();
  const next: Stats = {
    playedTotal: s.playedTotal + cleanNum(delta.playedTotal ?? 0),
    correctTotal: s.correctTotal + cleanNum(delta.correctTotal ?? 0),
    wrongTotal: s.wrongTotal + cleanNum(delta.wrongTotal ?? 0),
    masteredCount: s.masteredCount + cleanNum(delta.masteredCount ?? 0),
  };
  saveStats(next);
  return next;
};

export const resetStats = () => {
  saveStats({ playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0 });
};
