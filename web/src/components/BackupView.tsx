import { useRef } from "react";
import { exportAllLearningData, importAllLearningData } from "./learnStorage";

type Props = {
  onBack: () => void;
};

export default function BackupView(props: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const download = () => {
    const blob = new Blob([JSON.stringify(exportAllLearningData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `memorize-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (file: File) => {
    const text = await file.text();
    const json = JSON.parse(text) as Record<string, unknown>;
    importAllLearningData(json);
    alert("読み込みが完了しました。ページを再読み込みします。");
    location.reload();
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>バックアップ</div>
      </div>
      <div style={styles.card}>
        <div>学習記録はブラウザに保存されています。キャッシュやサイトデータを消すと記録が消えることがあります。</div>
        <button type="button" style={styles.btn} onClick={download}>学習データを書き出す</button>
        <button type="button" style={styles.btn} onClick={() => inputRef.current?.click()}>学習データを読み込む</button>
        <input ref={inputRef} type="file" accept="application/json" style={{ display: "none" }} onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) upload(file);
        }} />
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
  btn: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
};
