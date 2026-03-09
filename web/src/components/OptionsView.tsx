import { saveOptions, type Options } from "./optionsStore";

type Props = {
  value: Options;
  onChange: (v: Options) => void;
  onBack: () => void;
};

export default function OptionsView(props: Props) {
  const setQuizCount = (n: number) => {
    const fixed = Math.max(10, Math.min(200, Math.round(n / 10) * 10));
    const next = { ...props.value, quizCount: fixed };
    props.onChange(next);
    saveOptions(next);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>
          タイトルへ戻る
        </button>
        <div style={styles.h1}>オプション</div>
      </div>

      <div style={styles.card}>
        <div style={styles.label}>1回の問題モードで何人ずつするか</div>
        <div style={styles.row}>
          {[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].map((n) => (
            <button
              key={n}
              type="button"
              style={n === props.value.quizCount ? styles.picked : styles.pill}
              onClick={() => setQuizCount(n)}
            >
              {n}人
            </button>
          ))}
        </div>
        <div style={styles.note}>現在：{props.value.quizCount}人</div>
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
    width: "min(720px, 100%)",
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
  card: {
    width: "min(720px, 100%)",
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  label: {
    fontSize: 16,
    fontWeight: 700,
  },
  row: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  pill: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #999",
    background: "#fff",
  },
  picked: {
    padding: "10px 12px",
    borderRadius: 999,
    border: "1px solid #0969da",
    background: "#eef6ff",
    fontWeight: 800,
  },
  note: {
    fontSize: 14,
    color: "#444",
  },
};
