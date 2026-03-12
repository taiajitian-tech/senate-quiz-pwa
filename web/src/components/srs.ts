export type Grade = "good" | "hard" | "again";

export type ProgressItem = {
  id: number;
  reps: number;
  intervalMin: number;
  due: number; // epoch ms
  lastGrade?: Grade;
  updatedAt: number;
};

const MIN = 60_000;

export function nextIntervalMin(prev: ProgressItem | undefined, grade: Grade): number {
  const reps = prev?.reps ?? 0;

  if (grade === "again") return reps <= 1 ? 1 : 3;

  if (grade === "hard") {
    if (reps <= 0) return 3;
    if (reps === 1) return 10;
    if (reps === 2) return 60;
    if (reps === 3) return 6 * 60;
    return 24 * 60;
  }

  // good
  if (reps <= 0) return 5;
  if (reps === 1) return 30;
  if (reps === 2) return 6 * 60;
  if (reps === 3) return 24 * 60;
  if (reps === 4) return 3 * 24 * 60;
  return 7 * 24 * 60;
}

export function applyGrade(prev: ProgressItem | undefined, id: number, grade: Grade, now = Date.now()): ProgressItem {
  const base: ProgressItem = prev ?? {
    id,
    reps: 0,
    intervalMin: 0,
    due: now,
    updatedAt: now,
  };

  const newReps = grade === "again" ? 0 : Math.min((base.reps ?? 0) + 1, 50);
  const intervalMin = nextIntervalMin(base, grade);

  return {
    id,
    reps: newReps,
    intervalMin,
    due: now + intervalMin * MIN,
    lastGrade: grade,
    updatedAt: now,
  };
}
