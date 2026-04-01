import type { AppMode, Target } from "./data";

export type Stats = {
  playedTotal: number;
  correctTotal: number;
  wrongTotal: number;
  masteredCount: number;
  leechCount: number;
};

const key = (mode: AppMode, target: Target) => `senateQuiz:${mode}:${target}:stats:v1`;

const cleanNum = (v: unknown) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
};

export const loadStats = (mode: AppMode, target: Target): Stats => {
  try {
    const raw = localStorage.getItem(key(mode, target));
    if (!raw) return { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0, leechCount: 0 };
    const p = JSON.parse(raw) as Partial<Stats>;
    return {
      playedTotal: cleanNum(p.playedTotal),
      correctTotal: cleanNum(p.correctTotal),
      wrongTotal: cleanNum(p.wrongTotal),
      masteredCount: cleanNum(p.masteredCount),
      leechCount: cleanNum(p.leechCount),
    };
  } catch {
    return { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0, leechCount: 0 };
  }
};

export const saveStats = (mode: AppMode, target: Target, s: Stats) => {
  try {
    localStorage.setItem(key(mode, target), JSON.stringify(s));
  } catch {
    // ignore
  }
};

export const bumpStats = (mode: AppMode, target: Target, delta: Partial<Stats>) => {
  const s = loadStats(mode, target);
  const next: Stats = {
    playedTotal: s.playedTotal + cleanNum(delta.playedTotal ?? 0),
    correctTotal: s.correctTotal + cleanNum(delta.correctTotal ?? 0),
    wrongTotal: s.wrongTotal + cleanNum(delta.wrongTotal ?? 0),
    masteredCount: s.masteredCount + cleanNum(delta.masteredCount ?? 0),
    leechCount: s.leechCount + cleanNum(delta.leechCount ?? 0),
  };
  saveStats(mode, target, next);
  return next;
};

export const resetStats = (mode: AppMode, target: Target) => {
  saveStats(mode, target, { playedTotal: 0, correctTotal: 0, wrongTotal: 0, masteredCount: 0, leechCount: 0 });
};
