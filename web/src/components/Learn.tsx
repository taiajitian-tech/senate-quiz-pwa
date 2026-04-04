// PATCH: prioritize new members safely
// 既存の候補配列 candidates 作成後に追加

candidates.sort((a, b) => {
  const aNew = a?.addedAt ? 1 : 0;
  const bNew = b?.addedAt ? 1 : 0;
  return bNew - aNew;
});
