import { useEffect, useMemo, useState } from "react";
import { loadMasteredIds, loadWrongIds } from "./progress";

type Senator = {
  id: number;
  name: string;
  group?: string;
  images: string[];
};

type Props = {
  onBack: () => void;
};

export default function SenatorList(props: Props) {
  const [senators, setSenators] = useState<Senator[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}data/senators.json`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        const arr = Array.isArray(json) ? (json as Senator[]) : [];
        setSenators(arr);
      } catch (e) {
        console.error(e);
        setSenators([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const wrongSet = useMemo(() => new Set(loadWrongIds()), []);
  const masteredSet = useMemo(() => new Set(loadMasteredIds()), []);

  const filtered = useMemo(() => {
    const key = q.trim();
    if (!key) return senators;
    return senators.filter((s) => {
      const name = (s.name ?? "").toLowerCase();
      const group = (s.group ?? "").toLowerCase();
      return name.includes(key.toLowerCase()) || group.includes(key.toLowerCase());
    });
  }, [q, senators]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>
          タイトルへ戻る
        </button>
        <div style={styles.h1}>議員一覧</div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 / 会派で検索"
          style={styles.search}
        />
        <div style={styles.sub}>
          {loading ? "読み込み中" : `表示：${filtered.length} / ${senators.length}`}
        </div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={styles.list}>
        {filtered.map((s) => {
          const imgUrl = s.images?.[0] ?? "";
          const cleanedName = (s.name ?? "").split("：")[0].split(":")[0];
          const isWrong = wrongSet.has(s.id);
          const isMastered = masteredSet.has(s.id);
          return (
            <div key={s.id} style={styles.item}>
              <div style={styles.avatarBox}>
                {imgUrl ? <img src={imgUrl} style={styles.avatar} /> : <div style={styles.noAvatar}>no</div>}
              </div>
              <div style={styles.meta}>
                <div style={styles.nameRow}>
                  <div style={styles.name}>{cleanedName}</div>
                  <div style={styles.badges}>
                    {isMastered ? <span style={styles.badgeOk}>完全</span> : null}
                    {isWrong ? <span style={styles.badgeNg}>復習</span> : null}
                  </div>
                </div>
                <div style={styles.group}>{s.group ?? ""}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  header: {
    width: "min(820px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
  },
  h1: {
    fontSize: 22,
    fontWeight: 800,
  },
  search: {
    width: "100%",
    padding: "12px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    fontSize: 16,
  },
  sub: {
    fontSize: 13,
    color: "#444",
  },
  list: {
    width: "min(820px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  item: {
    display: "flex",
    gap: 12,
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 10,
    alignItems: "center",
  },
  avatarBox: {
    width: 64,
    height: 64,
    borderRadius: 10,
    overflow: "hidden",
    background: "#f3f3f3",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  avatar: { width: "100%", height: "100%", objectFit: "cover" },
  noAvatar: { fontSize: 12, color: "#777" },
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 4 },
  nameRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 16, fontWeight: 800 },
  group: { fontSize: 14, color: "#444" },
  badges: { display: "flex", gap: 6, alignItems: "center" },
  badgeOk: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #1a7f37",
    background: "#eafff0",
    fontSize: 12,
    fontWeight: 800,
  },
  badgeNg: {
    padding: "4px 8px",
    borderRadius: 999,
    border: "1px solid #cf222e",
    background: "#fff0f0",
    fontSize: 12,
    fontWeight: 800,
  },
};
