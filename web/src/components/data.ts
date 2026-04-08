export function formatDisplayName(item, sameLastNameCount) {
  const { name, role, committeeName } = item;

  const getLastName = (name) => {
    return name.replace(/\s/g, '').slice(0, name.length <= 3 ? 1 : 2);
  };

  const lastName = getLastName(name);
  const isDuplicate = sameLastNameCount[lastName] > 1;
  const displayName = isDuplicate ? name : lastName;

  if (role.includes('懲罰委員長')) return name;
  if (role.includes('特別委員長')) return `${displayName}特別委員長`;
  if (role.includes('調査会長')) return `${displayName}調査会長`;
  if (role.includes('審査会長')) return `${displayName}審査会長`;
  if (role.includes('委員長') && committeeName) return `${committeeName}委員長`;
  if (role.includes('副大臣')) return `${displayName}副大臣`;

  return name;
}
