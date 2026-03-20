import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { loadMasteredIds, loadWrongIds } from "./progress";
import { parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";
import SafeImage from "./SafeImage";

type Props = {
  target: Target;
  onBack: () => void;
};

type SortKey = "name_asc" | "name_desc" | "party" | "district" | "terms" | "year_asc" | "year_desc";

function textValue(value?: string): string {
  return (value ?? "").trim();
}

function numberValue(value?: number, fallback = Number.MAX_SAFE_INTEGER): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function districtRank(value?: string): number {
  const v = textValue(value);
  if (!v) return 2;
  if (v.includes("比例")) return 1;
  return 0;
}

function compareByName(a: Person, b: Person, desc = false): number {
  const left = textValue(a.name);
  const right = textValue(b.name);
  return desc ? right.localeCompare(left, "ja") : left.localeCompare(right, "ja");
}

function comparePersons(a: Person, b: Person, sortKey: SortKey): number {
  switch (sortKey) {
    case "name_asc":
      return compareByName(a, b, false);
    case "name_desc":
      return compareByName(a, b, true);
    case "party": {
      const cmp = textValue(a.party || a.group).localeCompare(textValue(b.party || b.group), "ja");
      return cmp || compareByName(a, b, false);
    }
    case "district": {
      const rank = districtRank(a.district) - districtRank(b.district);
      if (rank !== 0) return rank;
      const cmp = textValue(a.district).localeCompare(textValue(b.district), "ja");
      return cmp || compareByName(a, b, false);
    }
    case "terms": {
      const cmp = numberValue(a.terms) - numberValue(b.terms);
      return cmp || compareByName(a, b, false);
    }
    case "year_asc": {
      const cmp = numberValue(a.nextElectionYear) - numberValue(b.nextElectionYear);
      return cmp || compareByName(a, b, false);
    }
    case "year_desc": {
      const cmp = numberValue(b.nextElectionYear, Number.MIN_SAFE_INTEGER) - numberValue(a.nextElectionYear, Number.MIN_SAFE_INTEGER);
      return cmp || compareByName(a, b, false);
    }
    default:
      return 0;
  }
}

export default function SenatorList(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setItems(parsePersonsJson(json));
      } catch (e) {
        console.error(e);
        setItems([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const wrongSet = useMemo(() => new Set(loadWrongIds(props.target)), [props.target]);
  const masteredSet = useMemo(() => new Set(loadMasteredIds(props.target)), [props.target]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return items;
    return items.filter((s) => {
      return s.name.toLowerCase().includes(key)
        || (s.kana ?? "").toLowerCase().includes(key)
        || (s.party ?? s.group ?? "").toLowerCase().includes(key)
        || (s.district ?? "").toLowerCase().includes(key);
    });
  }, [q, items]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => comparePersons(a, b, sortKey));
  }, [filtered, sortKey]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>一覧</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前 / 政党 / 選挙区で検索" style={styles.search} />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={styles.select}>
          <option value="name_asc">名前（昇順）</option>
          <option value="name_desc">名前（降順）</option>
          <option value="party">政党</option>
          <option value="district">選挙区</option>
          <option value="terms">当選回数</option>
          <option value="year_asc">次の改選年（昇順）</option>
          <option value="year_desc">次の改選年（降順）</option>
        </select>
        <div style={styles.sub}>{loading ? "読み込み中" : `表示：${sorted.length} / ${items.length}`}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>
      <div style={styles.list}>
        {sorted.map((s) => (
          <div key={s.id} style={styles.item}>
            <div style={styles.avatarBox}>
              <SafeImage src={s.images?.[0] ?? ""} alt={s.name} style={styles.avatar} fallbackStyle={styles.noAvatar} fallbackText="画像なし" />
            </div>
            <div style={styles.meta}>
              <div style={styles.nameRow}>
                <div style={styles.name}>{s.name}</div>
                <div style={styles.badges}>
                  {s.aiGuess ? <span style={styles.badgeGuess}>推定</span> : null}
                  {masteredSet.has(s.id) ? <span style={styles.badgeOk}>完全</span> : null}
                  {wrongSet.has(s.id) ? <span style={styles.badgeNg}>復習</span> : null}
                </div>
              </div>
              {s.kana ? <div style={styles.kana}>{s.kana}</div> : null}
              <div style={styles.detail}>政党：{s.party || s.group || "不明"}</div>
              <div style={styles.detail}>選挙区：{s.district || "不明"}</div>
              <div style={styles.detail}>当選回数：{typeof s.terms === "number" ? `${s.terms}回` : "不明"}</div>
              <div style={styles.detail}>次の改選年：{typeof s.nextElectionYear === "number" ? `${s.nextElectionYear}年` : "不明"}</div>
            </div>
          </div>
        ))}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（一覧）">
        <p>名前、政党、選挙区で検索できます。一覧はソート切替にも対応しています。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  h1: { fontSize: 22, fontWeight: 800 },
  search: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
  select: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16, background: "#fff" },
  sub: { fontSize: 13, color: "#444" },
  list: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 10 },
  item: { display: "flex", gap: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12, alignItems: "center" },
  avatarBox: { width: 96, height: 96, borderRadius: 12, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 96px" },
  avatar: { width: "100%", height: "100%", objectFit: "cover" },
  noAvatar: { fontSize: 12, color: "#777" },
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
  nameRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 18, fontWeight: 800 },
  kana: { fontSize: 14, color: "#666" },
  detail: { fontSize: 15, color: "#444" },
  badges: { display: "flex", gap: 6, alignItems: "center" },
  badgeOk: { padding: "4px 8px", borderRadius: 999, border: "1px solid #1a7f37", background: "#eafff0", fontSize: 12, fontWeight: 800 },
  badgeNg: { padding: "4px 8px", borderRadius: 999, border: "1px solid #cf222e", background: "#fff0f0", fontSize: 12, fontWeight: 800 },
  badgeGuess: { padding: "4px 8px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
};
