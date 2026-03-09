import type { Target } from "./data";
import { targetLabels } from "./data";
import { loadStats, resetStats, type Stats } from "./stats";

type Props = {
  target: Target;
  onBack: () => void;
};

export default function StatsView(props: Props) {
  const stats: Stats = loadStats(props.target);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>成績確認</div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
      </div>

      <div style={styles.card}>
        <div style={styles.row}><div style={styles.k}>総プレイ</div><div style={styles.v}>{stats.playedTotal}</div></div>
        <div style={styles.row}><div style={styles.k}>正解</div><div style={styles.v}>{stats.correctTotal}</div></div>
        <div style={styles.row}><div style={styles.k}>間違い</div><div style={styles.v}>{stats.wrongTotal}</div></div>
        <div style={styles.row}><div style={styles.k}>完全正解</div><div style={styles.v}>{stats.masteredCount}</div></div>
        <button type="button" style={styles.dangerBtn} onClick={() => { resetStats(props.target); location.reload(); }}>成績リセット</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#444" },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" },
  k: { fontWeight: 700 }, v: { fontWeight: 800 },
  dangerBtn: { marginTop: 10, padding: "12px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 800 },
};
