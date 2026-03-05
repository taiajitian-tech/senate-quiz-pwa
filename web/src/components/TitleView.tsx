import { useState } from "react";
import HelpModal from "./HelpModal";

type Props = {
  onStartLearn: () => void;
  onStartReview: () => void;
  onOpenStats: () => void;
  onOpenOptions: () => void;
  onOpenList: () => void;
};

export default function TitleView(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <div style={styles.title}>議員集</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>

        <div style={styles.menu}>
          <button type="button" style={styles.primaryBtn} onClick={props.onStartLearn}>
            学習（思い出して覚える）
          </button>
          <button type="button" style={styles.btn} onClick={props.onStartReview}>
            復習（期限切れのみ）
          </button>
          <button type="button" style={styles.btn} onClick={props.onOpenList}>
            議員一覧
          </button>
          <button type="button" style={styles.btn} onClick={props.onOpenStats}>
            成績確認
          </button>
          <button type="button" style={styles.btn} onClick={props.onOpenOptions}>
            オプション
          </button>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（アプリ）">
        <p>学習は「顔を見て名前を思い出す→答えを見る→自己判定」で進みます。</p>
        <p>復習は期限切れのみ出題します。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "min(520px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  title: {
    fontSize: 40,
    fontWeight: 800,
    letterSpacing: 1,
  },
  menu: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  btn: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
    fontSize: 18,
  },
  primaryBtn: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #0969da",
    background: "#eef6ff",
    fontSize: 18,
    fontWeight: 700,
  },
};
