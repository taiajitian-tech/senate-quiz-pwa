// PATCH: mastered判定補助
export function updateMastery(item: any) {
  if (!item) return;
  if (item.correctStreak >= 5) {
    item.mastered = true;
  }
}
