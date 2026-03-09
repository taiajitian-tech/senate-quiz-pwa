import { saveOptions, type Options } from "./optionsStore";

type Props = {
  value: Options;
  onChange: (v: Options) => void;
  onBack: () => void;
};

export default function OptionsView(props: Props) {
  const update = (patch: Partial<Options>) => {
    const next = { ...props.value, ...patch };
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
        <div style={styles.label}>自動再生の顔表示時間</div>
        <div style={styles.row}>{[1,2,3,4,5].map((n) => <button key={n} type="button" style={n===props.value.autoFaceSeconds?styles.picked:styles.pill} onClick={() => update({ autoFaceSeconds: n })}>{n}秒</button>)}</div>
        <div style={styles.note}>現在：{props.value.autoFaceSeconds}秒</div>
      </div>

      <div style={styles.card}>
        <div style={styles.label}>自動再生の名前・会派表示時間</div>
        <div style={styles.row}>{[1,2,3,4,5].map((n) => <button key={n} type="button" style={n===props.value.autoAnswerSeconds?styles.picked:styles.pill} onClick={() => update({ autoAnswerSeconds: n })}>{n}秒</button>)}</div>
        <div style={styles.note}>現在：{props.value.autoAnswerSeconds}秒</div>
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
  label: { fontSize: 16, fontWeight: 700 },
  row: { display: "flex", flexWrap: "wrap", gap: 8 },
  pill: { padding: "10px 12px", borderRadius: 999, border: "1px solid #999", background: "#fff" },
  picked: { padding: "10px 12px", borderRadius: 999, border: "1px solid #0969da", background: "#eef6ff", fontWeight: 800 },
  note: { fontSize: 14, color: "#444" },
};
