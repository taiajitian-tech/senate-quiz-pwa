// 修正方針（実装例）

// 上段
const topLabel = (() => {
  if (item.type === 'viceMinister') return item.lastName + '副大臣';
  if (item.type === 'parliamentarySecretary') return item.lastName + '大臣政務官';
  if (item.type === 'committee') return item.lastName + item.role;
  if (item.type === 'disciplinary') return item.name;
  return item.name;
})();

// 下段
const bottomLabel = (() => {
  if (item.type === 'viceMinister' || item.type === 'parliamentarySecretary') {
    return `${item.name}（${item.kana}） ${item.role}`;
  }
  if (item.type === 'committee') {
    return `${item.name}（${item.kana}） ${item.fullRole}`;
  }
  if (item.type === 'disciplinary') {
    return '懲罰委員長';
  }
  return `${item.name}（${item.kana}） ${item.party || item.group}`;
})();
