import { useState } from "react";
import HelpModal from "./HelpModal";
import type { TargetKey } from "./data";

type Props = {
  target: TargetKey;
  onChangeTarget: (target: TargetKey) => void;
  onOpenFirst: () => void;
  onStartLearn: () => void;
  onStartReverse: () => void;
  onStartReview: () => void;
  onStartAutoplay: () => void;
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

        <div style={styles.switchRow}>
          <button type="button" style={props.target === "senators" ? styles.switchOn : styles.switchOff} onClick={() => props.onChangeTarget("senators")}>参議院議員</button>
          <button type="button" style={props.target === "ministers" ? styles.switchOn : styles.switchOff} onClick={() => props.onChangeTarget("ministers")}>現職大臣</button>
        </div>

        <div style={styles.menu}>
          <button type="button" style={styles.primaryBtn} onClick={props.onOpenFirst}>最初に（使い方）</button>
          <button type="button" style={styles.btn} onClick={props.onStartAutoplay}>自動再生</button>
          <button type="button" style={styles.btn} onClick={props.onStartLearn}>学習（顔→名前）</button>
          <button type="button" style={styles.btn} onClick={props.onStartReverse}>逆学習（名前→顔）</button>
          <button type="button" style={styles.btn} onClick={props.onStartReview}>復習（期限切れのみ）</button>
          <button type="button" style={styles.btn} onClick={props.onOpenList}>一覧</button>
          <button type="button" style={styles.btn} onClick={props.onOpenStats}>成績確認</button>
          <button type="button" style={styles.btn} onClick={props.onOpenOptions}>オプション</button>
          <button type="button" style={styles.btn} onClick={props.onOpenBackup}>バックアップ</button>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（トップ）">
        <p>「最初に」で全体の流れを確認できます。</p>
        <p>おすすめは、自動再生 → 学習 → 逆学習 → 復習です。</p>
        <p>分からないときは、考え込まずに次へ進む方が効率的です。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "min(560px, 100%)", display: "flex", flexDirection: "column", gap: 16, alignItems: "center" },
  titleRow: { width: "100%", display: "flex", justifyContent: "center", alignItems: "center", gap: 8, position: "relative" },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: 1 },
  helpBtn: { position: "absolute", right: 0, top: 0, width: 40, height: 40, borderRadius: 999, border: "1px solid #999", background: "#fff", fontSize: 18, fontWeight: 800 },
  switchRow: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 },
  switchOn: { padding: "12px 10px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontWeight: 800, fontSize: 16 },
  switchOff: { padding: "12px 10px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
  menu: { width: "100%", display: "flex", flexDirection: "column", gap: 10 },
  btn: { width: "100%", padding: "14px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 18 },
  primaryBtn: { width: "100%", padding: "14px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontSize: 18, fontWeight: 800 },
};
