export type Grade = "strong" | "good" | "hard" | "again";
export type CardStatus = "new" | "learning" | "review" | "mastered" | "leech";

export type ProgressItem = {
  id: number;
  reps: number;
  intervalMin: number;
  due: number; // epoch ms
  lastGrade?: Grade;
  updatedAt: number;
  stability: number; // days
  difficulty: number; // 1.0 - 10.0
  lapses: number;
  consecutiveCorrect: number;
  status: CardStatus;
  lastSeenAt: number;
};

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function estimateRecallProbability(progress: ProgressItem | undefined, now = Date.now()): number {
  if (!progress) return 0;
  const elapsedDays = Math.max((now - progress.lastSeenAt) / DAY, 0);
  const stability = Math.max(progress.stability, 0.15);
  return Math.exp(-elapsedDays / stability);
}

export function isMastered(progress: ProgressItem | undefined, now = Date.now()): boolean {
  if (!progress) return false;
  if (progress.status !== "mastered") return false;
  return progress.due > now;
}

export function sanitizeProgressItem(id: number, raw: Partial<ProgressItem>, now = Date.now()): ProgressItem {
  const reps = Number.isFinite(raw.reps) ? Math.max(0, Math.floor(raw.reps as number)) : 0;
  const lastSeenAt = Number.isFinite(raw.lastSeenAt) ? Number(raw.lastSeenAt) : Number(raw.updatedAt ?? now);
  const due = Number.isFinite(raw.due) ? Number(raw.due) : now;
  const intervalMinFromDue = Math.max(Math.round((due - now) / MIN), 0);
  const intervalMin = Number.isFinite(raw.intervalMin)
    ? Math.max(0, Math.round(raw.intervalMin as number))
    : intervalMinFromDue;
  const status: CardStatus =
    raw.status === "mastered" || raw.status === "leech" || raw.status === "learning" || raw.status === "review" || raw.status === "new"
      ? raw.status
      : reps === 0
        ? "new"
        : reps >= 4
          ? "review"
          : "learning";

  return {
    id,
    reps,
    intervalMin,
    due,
    lastGrade: raw.lastGrade === "strong" || raw.lastGrade === "good" || raw.lastGrade === "hard" || raw.lastGrade === "again" ? raw.lastGrade : undefined,
    updatedAt: Number.isFinite(raw.updatedAt) ? Number(raw.updatedAt) : now,
    stability: clamp(Number.isFinite(raw.stability) ? Number(raw.stability) : Math.max(intervalMin / (60 * 24), 0.3), 0.15, 3650),
    difficulty: clamp(Number.isFinite(raw.difficulty) ? Number(raw.difficulty) : 5, 1, 10),
    lapses: Number.isFinite(raw.lapses) ? Math.max(0, Math.floor(raw.lapses as number)) : 0,
    consecutiveCorrect: Number.isFinite(raw.consecutiveCorrect) ? Math.max(0, Math.floor(raw.consecutiveCorrect as number)) : reps,
    status,
    lastSeenAt,
  };
}

export function nextIntervalMin(prev: ProgressItem | undefined, grade: Grade, now = Date.now()): number {
  const next = applyGrade(prev, prev?.id ?? 0, grade, now);
  return next.intervalMin;
}

export function applyGrade(prev: ProgressItem | undefined, id: number, grade: Grade, now = Date.now()): ProgressItem {
  const base = sanitizeProgressItem(id, prev ?? { id }, now);

  if (grade === "again") {
    const lapses = base.lapses + 1;
    const immediateMinutes = lapses === 1 ? 10 : lapses === 2 ? 30 : 4 * 60;
    const stability = clamp(base.stability * 0.45, 0.15, 3650);
    const difficulty = clamp(base.difficulty + 0.7, 1, 10);
    return {
      ...base,
      reps: 0,
      intervalMin: immediateMinutes,
      due: now + immediateMinutes * MIN,
      lastGrade: grade,
      updatedAt: now,
      stability,
      difficulty,
      lapses,
      consecutiveCorrect: 0,
      status: lapses >= 3 ? "leech" : "learning",
      lastSeenAt: now,
    };
  }

  const nextConsecutive = base.consecutiveCorrect + 1;
  const stabilityBase = Math.max(base.stability, 0.15);
  const retention = estimateRecallProbability(base, now);
  const retentionBoost = 1 + (1 - retention) * 0.35;
  const learningBoost = 1 + Math.min(nextConsecutive, 8) * 0.08;
  const difficultyEase = (11 - base.difficulty) / 10;

  if (grade === "strong") {
    const stability = clamp(
      base.reps === 0
        ? 1.25
        : stabilityBase * (2.05 + difficultyEase * 0.95) * retentionBoost * (learningBoost + 0.12),
      0.8,
      3650
    );
    const intervalMin = Math.max(24 * 60, Math.round(stability * DAY / MIN));
    const mastered = nextConsecutive >= 5 && stability >= 35 && base.lapses <= 1;

    return {
      ...base,
      reps: Math.min(base.reps + 1, 100),
      intervalMin,
      due: now + intervalMin * MIN,
      lastGrade: grade,
      updatedAt: now,
      stability,
      difficulty: clamp(base.difficulty - 0.18, 1, 10),
      consecutiveCorrect: nextConsecutive,
      status: mastered ? "mastered" : stability >= 7 ? "review" : "learning",
      lastSeenAt: now,
    };
  }

  if (grade === "hard") {
    const stability = clamp(
      stabilityBase * (base.reps === 0 ? 1.4 : 1.18 + difficultyEase * 0.22) * retentionBoost,
      0.25,
      3650
    );
    const intervalMin = Math.max(60, Math.round(stability * DAY * 0.6 / MIN));
    return {
      ...base,
      reps: Math.min(base.reps + 1, 100),
      intervalMin,
      due: now + intervalMin * MIN,
      lastGrade: grade,
      updatedAt: now,
      stability,
      difficulty: clamp(base.difficulty + 0.15, 1, 10),
      consecutiveCorrect: nextConsecutive,
      status: stability >= 7 ? "review" : "learning",
      lastSeenAt: now,
    };
  }

  const stability = clamp(
    base.reps === 0
      ? 0.75
      : stabilityBase * (1.65 + difficultyEase * 0.75) * retentionBoost * learningBoost,
    0.4,
    3650
  );
  const intervalMin = Math.max(12 * 60, Math.round(stability * DAY / MIN));
  const mastered = nextConsecutive >= 6 && stability >= 45 && base.lapses <= 1;

  return {
    ...base,
    reps: Math.min(base.reps + 1, 100),
    intervalMin,
    due: now + intervalMin * MIN,
    lastGrade: grade,
    updatedAt: now,
    stability,
    difficulty: clamp(base.difficulty - 0.1, 1, 10),
    consecutiveCorrect: nextConsecutive,
    status: mastered ? "mastered" : stability >= 7 ? "review" : "learning",
    lastSeenAt: now,
  };
}

export function getForgettingScore(progress: ProgressItem | undefined, now = Date.now()): number {
  if (!progress) return 0;
  const retention = estimateRecallProbability(progress, now);
  const overdueFactor = progress.due <= now ? 0.5 + Math.min((now - progress.due) / DAY, 6) * 0.18 : 0;
  const leechFactor = progress.status === "leech" ? 0.45 : 0;
  const lapseFactor = Math.min(progress.lapses * 0.08, 0.4);
  return (1 - retention) + overdueFactor + leechFactor + lapseFactor;
}
