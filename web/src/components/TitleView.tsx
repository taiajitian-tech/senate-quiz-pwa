import { useState } from "react";
import type { Target } from "./data";
import { targetLabels, targetTabs } from "./data";
import HelpModal from "./HelpModal";

type Props = {
  target: Target;
  onChangeTarget: (target: Target) => void;
  onOpenFirstGuide: () => void;
  onStartLearn: () => void;
  onStartReverse: () => void;
  onStartReview: () => void;
  onOpenAutoplay: () => void;
  onOpenStats: () => void;
  onOpenOptions: () => void;
  onOpenList: () => void;
  onOpenBackup: () => void;
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

        <div style={styles.segment}>
          <button type="button" style={props.target === "senators" ? styles.segmentActive : styles.segmentBtn} onClick={() => props.onChangeTarget("senators")}>
            {targetTabs.senators}
          </button>
          <button type="button" style={props.target === "representatives" ? styles.segmentActive : styles.segmentBtn} onClick={() => props.onChangeTarget("representatives")}>
            {targetTabs.representatives}
          </button>
          <button type="button" style={props.target === "ministers" ? styles.segmentActive : styles.segmentBtn} onClick={() => props.onChangeTarget("ministers")}>
            {targetTabs.ministers}
          </button>
        </div>
        <div style={styles.targetLabel}>{targetLabels[props.target]}</div>

        <div style={styles.menu}>
          <button type="button" style={styles.primaryBtn} onClick={props.onOpenFirstGuide}>最初に（使い方）</button>
          <button type="button" style={styles.primaryBtn} onClick={props.onStartLearn}>学習（顔→名前）</button>
          <button type="button" style={styles.btn} onClick={props.onStartReverse}>逆学習（名前→顔）</button>
          <button type="button" style={styles.btn} onClick={props.onStartReview}>復習（期限切れのみ）</button>
          <button type="button" style={styles.btn} onClick={props.onOpenAutoplay}>自動再生</button>
          <button type="button" style={styles.btn} onClick={props.onOpenList}>一覧</button>
          <button type="button" style={styles.btn} onClick={props.onOpenStats}>成績確認</button>
          <button type="button" style={styles.btn} onClick={props.onOpenBackup}>バックアップ</button>
          <button type="button" style={styles.btn} onClick={props.onOpenOptions}>オプション</button>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（アプリ）">
        <p>学習は「顔を見て名前を思い出す→答えを見る→自己判定」で進みます。</p>
        <p>分からない場合は考え込まず、答えを見て次へ進む方が覚えやすいです。</p>
        <p>自動再生は、顔の認識速度を上げるためのモードです。</p>
      </HelpModal>
    </div>
  );
}

const commonBtn: React.CSSProperties = {
  width: "100%",
  padding: "14px 12px",
  borderRadius: 10,
  fontSize: 18,
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  card: {
    width: "min(560px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  titleRow: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: 1 },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  segment: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  segmentBtn: { ...commonBtn, border: "1px solid #999", background: "#fff", fontSize: 16 },
  segmentActive: { ...commonBtn, border: "1px solid #0969da", background: "#eef6ff", fontSize: 16, fontWeight: 700 },
  targetLabel: { fontSize: 14, color: "#444", alignSelf: "flex-start" },
  menu: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  btn: { ...commonBtn, border: "1px solid #999", background: "#fff" },
  primaryBtn: { ...commonBtn, border: "1px solid #0969da", background: "#eef6ff", fontWeight: 700 },
};
