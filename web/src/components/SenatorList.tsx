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

function sortText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function districtRank(value: string | undefined): number {
  const text = value ?? "";
  if (!text) return 2;
  if (text.includes("比例")) return 1;
  return 0;
}

function sortItems(items: Person[], sortKey: SortKey): Person[] {
  return [...items].sort((a, b) => {
    switch (sortKey) {
      case "name_asc":
        return a.name.localeCompare(b.name, "ja");
      case "name_desc":
        return b.name.localeCompare(a.name, "ja");
      case "party": {
        const diff = sortText(a.party ?? a.group).localeCompare(sortText(b.party ?? b.group), "ja");
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "ja");
      }
      case "district": {
        const rankDiff = districtRank(a.district) - districtRank(b.district);
        if (rankDiff !== 0) return rankDiff;
        const diff = sortText(a.district).localeCompare(sortText(b.district), "ja");
        return diff !== 0 ? diff : a.name.localeCompare(b.name, "ja");
      }
      case "terms": {
        const av = a.terms ?? Number.MAX_SAFE_INTEGER;
        const bv = b.terms ?? Number.MAX_SAFE_INTEGER;
        return av - bv || a.name.localeCompare(b.name, "ja");
      }
      case "year_asc": {
        const av = a.nextElectionYear ?? Number.MAX_SAFE_INTEGER;
        const bv = b.nextElectionYear ?? Number.MAX_SAFE_INTEGER;
        return av - bv || a.name.localeCompare(b.name, "ja");
      }
      case "year_desc": {
        const av = a.nextElectionYear ?? -1;
        const bv = b.nextElectionYear ?? -1;
        return bv - av || a.name.localeCompare(b.name, "ja");
      }
      default:
        return 0;
    }
  });
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
      const nextElectionText = s.nextElectionYear ? String(s.nextElectionYear) : "";
      const termsText = typeof s.terms === "number" ? String(s.terms) : "";
      return (
        s.name.toLowerCase().includes(key) ||
        (s.kana ?? "").toLowerCase().includes(key) ||
        (s.party ?? s.group ?? "").toLowerCase().includes(key) ||
        (s.district ?? "").toLowerCase().includes(key) ||
        termsText.includes(key) ||
        nextElectionText.includes(key)
      );
    });
  }, [q, items]);

  const sorted = useMemo(() => sortItems(filtered, sortKey), [filtered, sortKey]);
  const isSenators = props.target === "senators";

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>一覧</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前 / 政党 / 選挙区 / 回数 / 改選年で検索" style={styles.search} />
        {isSenators ? (
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={styles.select}>
            <option value="name_asc">名前（昇順）</option>
            <option value="name_desc">名前（降順）</option>
            <option value="party">政党</option>
            <option value="district">選挙区</option>
            <option value="terms">当選回数</option>
            <option value="year_asc">次の改選年（昇順）</option>
            <option value="year_desc">次の改選年（降順）</option>
          </select>
        ) : null}
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
              {isSenators ? (
                <div style={styles.infoGrid}>
                  <div style={styles.infoLine}>政党：{s.party ?? s.group ?? "不明"}</div>
                  <div style={styles.infoLine}>選挙区：{s.district ?? "不明"}</div>
                  <div style={styles.infoLine}>当選回数：{typeof s.terms === "number" ? `${s.terms}回` : "不明"}</div>
                  <div style={styles.infoLine}>次の改選年：{s.nextElectionYear ? `${s.nextElectionYear}年` : "不明"}</div>
                </div>
              ) : (
                <div style={styles.group}>{s.group ?? ""}</div>
              )}
            </div>
          </div>
        ))}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（一覧）">
        <p>名前、政党、選挙区、当選回数、改選年で検索できます。</p>
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
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  nameRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 18, fontWeight: 800 },
  kana: { fontSize: 14, color: "#666" },
  group: { fontSize: 15, color: "#444" },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 },
  infoLine: { fontSize: 14, color: "#444" },
  badges: { display: "flex", gap: 6, alignItems: "center" },
  badgeOk: { padding: "4px 8px", borderRadius: 999, border: "1px solid #1a7f37", background: "#eafff0", fontSize: 12, fontWeight: 800 },
  badgeNg: { padding: "4px 8px", borderRadius: 999, border: "1px solid #cf222e", background: "#fff0f0", fontSize: 12, fontWeight: 800 },
  badgeGuess: { padding: "4px 8px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
};
