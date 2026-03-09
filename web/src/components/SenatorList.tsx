import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { loadProgress } from "./learnStorage";
import { parsePeopleJson, TARGET_DATA_PATH, TARGET_LABEL, type Person, type TargetKey, cleanDisplayName } from "./data";
import SafeImage from "./SafeImage";

type Props = {
  target: TargetKey;
  onBack: () => void;
};

export default function SenatorList(props: Props) {
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${TARGET_DATA_PATH[props.target]}`;
  const progress = loadProgress(props.target);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setPeople(parsePeopleJson(json));
      } catch (e) {
        console.error(e);
        setPeople([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return people;
    return people.filter((p) => cleanDisplayName(p.name).toLowerCase().includes(key) || (p.group ?? "").toLowerCase().includes(key));
  }, [q, people]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>{TARGET_LABEL[props.target]}一覧</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="名前 / 会派・役職で検索" style={styles.search} />
        <div style={styles.sub}>{loading ? "読み込み中" : `表示：${filtered.length} / ${people.length}`}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>
      <div style={styles.list}>
        {filtered.map((p) => {
          const status = progress[p.id]?.lastGrade;
          return (
            <div key={p.id} style={styles.item}>
              <div style={styles.avatarBox}>
                <SafeImage src={p.images?.[0] ?? ""} alt={p.name} style={styles.avatar} fallbackStyle={styles.noAvatar} fallbackText="画像なし" />
              </div>
              <div style={styles.meta}>
                <div style={styles.nameRow}>
                  <div style={styles.name}>{cleanDisplayName(p.name)}</div>
                  {status ? <span style={status === "good" ? styles.badgeGood : status === "hard" ? styles.badgeHard : styles.badgeAgain}>{status === "good" ? "覚えた" : status === "hard" ? "うろ覚え" : "要復習"}</span> : null}
                </div>
                <div style={styles.group}>{p.group ?? ""}</div>
              </div>
            </div>
          );
        })}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title={`ヘルプ（${TARGET_LABEL[props.target]}一覧）`}>
        <p>一覧では、名前と会派・役職を確認できます。</p>
        <p>学習のあとに見返すと、記憶の整理に役立ちます。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerRow: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { width: 40, height: 40, borderRadius: 999, border: "1px solid #999", background: "#fff", fontSize: 18, fontWeight: 800 },
  h1: { fontSize: 22, fontWeight: 800 },
  search: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
  sub: { fontSize: 13, color: "#444" },
  list: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 10 },
  item: { display: "flex", gap: 12, border: "1px solid #ddd", borderRadius: 12, padding: 10, alignItems: "center" },
  avatarBox: { width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" },
  avatar: { width: "100%", height: "100%", objectFit: "cover" },
  noAvatar: { fontSize: 12, color: "#777" },
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
  nameRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 16, fontWeight: 800 },
  group: { fontSize: 14, color: "#444" },
  badgeGood: { padding: "4px 8px", borderRadius: 999, border: "1px solid #1a7f37", background: "#eafff0", fontSize: 12, fontWeight: 800 },
  badgeHard: { padding: "4px 8px", borderRadius: 999, border: "1px solid #9a6700", background: "#fff8c5", fontSize: 12, fontWeight: 800 },
  badgeAgain: { padding: "4px 8px", borderRadius: 999, border: "1px solid #cf222e", background: "#fff0f0", fontSize: 12, fontWeight: 800 },
};
