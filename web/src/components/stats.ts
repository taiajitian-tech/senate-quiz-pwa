import type { Target } from "./data";

export type Stats = {
  playedTotal: number;
  correctTotal: number;
  wrongTotal: number;
  masteredCount: number;
};

const key = (target: Target) => `senateQuiz:${target}:stats:v1`;

const cleanNum = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
};

export const loadStats = (target: Target): Stats => {
  try {
    const raw = localStorage.getItem(key(target));
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

export const saveStats = (target: Target, s: Stats) => {
  try {
    localStorage.setItem(key(target), JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const bumpStats = (target: Target, delta: Partial<Stats>) => {
  const s = loadStats(target);
  const next: Stats = {
    playedTotal: s.playedTotal + cleanNum(delta.playedTotal ?? 0),
    correctTotal: s.correctTotal + cleanNum(delta.correctTotal ?? 0),
    wrongTotal: s.wrongTotal + cleanNum(delta.wrongTotal ?? 0),
    masteredCount: s.masteredCount + cleanNum(delta.masteredCount ?? 0),
  };
  saveStats(target, next);
  return next;
};

export const resetStats = (target: Target) => {
  saveStats(target, { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0 });
};
