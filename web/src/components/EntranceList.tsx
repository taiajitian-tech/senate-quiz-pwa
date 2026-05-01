type EntranceListItem = {
  id: number | string;
  title?: string;
  name: string;
  kana?: string;
  role?: string;
  subRole?: string;
  party?: string;
  group?: string;
};

type EntranceListProps = {
  items: EntranceListItem[];
};

function getDisplaySub(item: EntranceListItem): string {
  return item.role || item.subRole || item.party || item.group || "";
}

export default function EntranceList({ items }: EntranceListProps) {
  return (
    <div>
      {items.map((item) => (
        <div className="card" key={item.id}>
          <div className="title">{item.title || item.name}</div>
          <div className="name">
            {item.name}
            {item.kana ? <span className="kana">{item.kana}</span> : null}
          </div>
          <div className="sub">{getDisplaySub(item)}</div>
        </div>
      ))}
    </div>
  );
}
