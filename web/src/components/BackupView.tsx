import { useRef } from "react";
import { exportAllLearningData, importAllLearningData } from "./learnStorage";

type Props = {
  onBack: () => void;
};

export default function BackupView(props: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);

  const onExport = () => {
    const blob = new Blob([exportAllLearningData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "senate-quiz-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (file: File) => {
    const text = await file.text();
    importAllLearningData(text);
    location.reload();
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>バックアップ</div>
      </div>
      <div style={styles.card}>
        <button type="button" style={styles.btn} onClick={onExport}>学習データを書き出す</button>
        <button type="button" style={styles.btn} onClick={() => fileRef.current?.click()}>学習データを読み込む</button>
        <input ref={fileRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => { const file = e.target.files?.[0]; if (file) void onImport(file); }} />
        <div style={styles.note}>キャッシュ削除や端末移行に備えるための機能です。</div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10 },
  btn: { padding: "12px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
  note: { fontSize: 14, color: "#555" },
};
