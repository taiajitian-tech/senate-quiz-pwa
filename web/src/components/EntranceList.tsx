// 修正済み EntranceList.tsx（差し替え用）

const getDisplaySub = (item: any) => {
  if (item.role) return item.role;
  if (item.subRole) return item.subRole;
  if (item.party) return item.party;
  if (item.group) return item.group;
  return '';
};

export default function EntranceList({ items }: any) {
  return (
    <div>
      {items.map((item: any) => (
        <div className="card" key={item.id}>
          <div className="title">{item.title}</div>

          <div className="name">
            {item.name}
            {item.kana && <span className="kana">{item.kana}</span>}
          </div>

          <div className="sub">
            {getDisplaySub(item)}
          </div>
        </div>
      ))}
    </div>
  );
}
