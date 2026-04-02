// PATCH: 学習優先順位
export function getPriority(item) {
  if (item.isDue) return 1;
  if (item.isLeech) return 2;
  if (item.isNew) return 3;
  return 4;
}
