// 修正済 Learn.tsx 抜粋（表示ロジックのみ差し替え）

const getTop = (item:any) => {
  if (item.role?.includes('副大臣')) return item.name.slice(0, item.name.length - 2) + '副大臣';
  if (item.role?.includes('大臣政務官')) return item.name.slice(0, item.name.length - 2) + '大臣政務官';
  if (item.role?.includes('委員長') || item.role?.includes('会長')) {
    if (item.role === '懲罰委員長') return item.name;
    return item.name.slice(0, item.name.length - 2) + item.role;
  }
  return `${item.name} ${item.kana}`;
};

const getBottom = (item:any) => {
  if (item.role?.includes('副大臣') || item.role?.includes('大臣政務官')) {
    return `${item.name}（${item.kana}） ${item.role}`;
  }
  if (item.role?.includes('委員長') || item.role?.includes('会長')) {
    if (item.role === '懲罰委員長') return '懲罰委員長';
    return `${item.name}（${item.kana}） ${item.role}`;
  }
  return `${item.name}（${item.kana}） ${item.party || item.group}`;
};
