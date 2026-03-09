import { loadHistory, loadProgress, resetLearning } from "./learnStorage";
import { TARGET_LABEL, type TargetKey } from "./data";

type Props = {
  target: TargetKey;
  onBack: () => void;
};

export default function StatsView(props: Props) {
  const progress = loadProgress(props.target);
  const history = loadHistory(props.target);
  const progressItems = Object.values(progress);
  const good = history.filter((h) => h.grade === "good").length;
  const hard = history.filter((h) => h.grade === "hard").length;
  const again = history.filter((h) => h.grade === "again").length;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>成績確認（{TARGET_LABEL[props.target]}）</div>
      </div>

      <div style={styles.card}>
        <Row k="学習済み人数" v={String(progressItems.length)} />
        <Row k="覚えていた" v={String(good)} />
        <Row k="うろ覚え" v={String(hard)} />
        <Row k="覚えていない" v={String(again)} />
        <Row k="期限切れ" v={String(progressItems.filter((p) => p.due <= Date.now()).length)} />

        <button type="button" style={styles.dangerBtn} onClick={() => {
          resetLearning(props.target);
          location.reload();
        }}>この対象の記録をリセット</button>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={styles.row}><div style={styles.k}>{k}</div><div style={styles.v}>{v}</div></div>;
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  row: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" },
  k: { fontWeight: 700 },
  v: { fontWeight: 800 },
  dangerBtn: { marginTop: 10, padding: "12px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 800 },
};
