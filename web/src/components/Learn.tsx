// PATCH: low-frequency reintroduce mastered
// 既存の出題候補生成ロジック内に追加してください

// 完全習得でも低確率で再出（約5%）
if (item.mastered && Math.random() < 0.05) {
  candidates.push(item);
}
