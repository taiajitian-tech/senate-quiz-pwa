export function formatDisplayName(item, sameLastNameCount) {
  const { name, role = "", subRole = "", group = "", committeeName } = item;

  const getLastName = (name) => {
    return name.replace(/\s/g, '').slice(0, name.length <= 3 ? 1 : 2);
  };

  const lastName = getLastName(name);
  const isDuplicate = sameLastNameCount[lastName] > 1;
  const displayName = isDuplicate ? name : lastName;

  const r = subRole || group || role || "";

  if (r.includes('懲罰委員長')) return name;
  if (r.includes('特別委員長')) return `${displayName}特別委員長`;
  if (r.includes('調査会長')) return `${displayName}調査会長`;

  // 審査会会長で統一
  if (r.includes('審査会会長') || r.includes('審査会長')) {
    return `${displayName}審査会会長`;
  }

  if (r.includes('委員長') && committeeName) return `${committeeName}委員長`;
  if (r.includes('副大臣')) return `${displayName}副大臣`;

  return name;
}
