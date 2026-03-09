import { useState } from "react";
import { saveOptions, type Options } from "./optionsStore";

type Props = {
  value: Options;
  onChange: (v: Options) => void;
  onBack: () => void;
};

export default function OptionsView(props: Props) {
  const [value, setValue] = useState<Options>(props.value);

  const commit = (next: Options) => {
    setValue(next);
    props.onChange(next);
    saveOptions(next);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>オプション</div>
      </div>
      <div style={styles.card}>
        <label style={styles.label}>1回の問題数</label>
        <select value={value.quizCount} style={styles.select} onChange={(e) => commit({ ...value, quizCount: Number(e.target.value) })}>
          {[10,20,30,40,50,60,80,100].map((n) => <option key={n} value={n}>{n}問</option>)}
        </select>
        <label style={styles.label}>自動再生：顔の秒数</label>
        <select value={value.faceSeconds} style={styles.select} onChange={(e) => commit({ ...value, faceSeconds: Number(e.target.value) })}>
          {[1,2,3,4,5,6,8,10].map((n) => <option key={n} value={n}>{n}秒</option>)}
        </select>
        <label style={styles.label}>自動再生：名前の秒数</label>
        <select value={value.answerSeconds} style={styles.select} onChange={(e) => commit({ ...value, answerSeconds: Number(e.target.value) })}>
          {[1,2,3,4,5,6,8,10].map((n) => <option key={n} value={n}>{n}秒</option>)}
        </select>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 8 },
  label: { fontWeight: 700 },
  select: { padding: "12px 10px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
};
