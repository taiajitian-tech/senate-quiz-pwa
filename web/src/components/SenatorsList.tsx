import { useState } from "react";

export default function SenatorsList({ data }) {
  const [sortKey, setSortKey] = useState("name_asc");

  const sorted = [...data].sort((a, b) => {
    const val = (k) => (k === null || k === undefined ? "" : k);

    switch (sortKey) {
      case "name_asc":
        return val(a.name).localeCompare(val(b.name), "ja");
      case "name_desc":
        return val(b.name).localeCompare(val(a.name), "ja");
      case "party":
        return val(a.party).localeCompare(val(b.party), "ja");
      case "district":
        if (a.district === "比例" && b.district !== "比例") return 1;
        if (b.district === "比例" && a.district !== "比例") return -1;
        return val(a.district).localeCompare(val(b.district), "ja");
      case "terms":
        return (a.terms ?? 999) - (b.terms ?? 999);
      case "year_asc":
        return (a.nextElectionYear ?? 9999) - (b.nextElectionYear ?? 9999);
      case "year_desc":
        return (b.nextElectionYear ?? 0) - (a.nextElectionYear ?? 0);
      default:
        return 0;
    }
  });

  return (
    <div>
      <select value={sortKey} onChange={(e) => setSortKey(e.target.value)}>
        <option value="name_asc">名前（昇順）</option>
        <option value="name_desc">名前（降順）</option>
        <option value="party">政党</option>
        <option value="district">選挙区</option>
        <option value="terms">当選回数</option>
        <option value="year_asc">改選年（昇順）</option>
        <option value="year_desc">改選年（降順）</option>
      </select>

      <div>
        {sorted.map((s) => (
          <div key={s.id} style={{ marginBottom: "12px" }}>
            <div>{s.name}</div>
            <div>政党：{s.party || "不明"}</div>
            <div>選挙区：{s.district || "不明"}</div>
            <div>当選回数：{s.terms ?? "不明"}</div>
            <div>改選年：{s.nextElectionYear ?? "不明"}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
