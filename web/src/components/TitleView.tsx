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

type MenuButtonProps = {
  label: string;
  sub: string;
  primary?: boolean;
  onClick: () => void;
};

function MenuButton(props: MenuButtonProps) {
  return (
    <button type="button" style={props.primary ? styles.primaryCardBtn : styles.cardBtn} onClick={props.onClick}>
      <div style={styles.cardBtnTitle}>{props.label}</div>
      <div style={styles.cardBtnSub}>{props.sub}</div>
    </button>
  );
}

export default function TitleView(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.titleRow}>
          <div>
            <div style={styles.title}>議員集</div>
            <div style={styles.titleSub}>顔と名前を、流れに沿って覚える学習アプリ</div>
          </div>
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

        <div style={styles.guideBox}>
          <div style={styles.guideTitle}>おすすめの順番</div>
          <div style={styles.stepGrid}>
            <div style={styles.stepCard}><div style={styles.stepNum}>1</div><div><b>自動再生</b><div style={styles.stepText}>まず多くの顔を一気に見る</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>2</div><div><b>学習</b><div style={styles.stepText}>顔を見て名前を思い出す</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>3</div><div><b>逆学習</b><div style={styles.stepText}>名前から顔も引けるようにする</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>4</div><div><b>復習</b><div style={styles.stepText}>忘れかけを戻して定着させる</div></div></div>
          </div>
          <div style={styles.memoryBox}>
            <div style={styles.memoryTitle}>記憶が定着する流れ</div>
            <div style={styles.memoryText}>最初に多くの顔を見て全体像を作り、その後に短い間隔で思い出す回数を増やすと、顔と名前が結び付きやすくなります。</div>
          </div>
        </div>

        <div style={styles.menu}>
          <MenuButton primary label="最初に（使い方）" sub="各モードの順番と覚え方を見る" onClick={props.onOpenFirstGuide} />
          <MenuButton primary label="学習（顔→名前）" sub="基本モード。顔から名前を引く力を付ける" onClick={props.onStartLearn} />
          <MenuButton label="逆学習（名前→顔）" sub="名前を見て顔を思い出す力を付ける" onClick={props.onStartReverse} />
          <MenuButton label="復習（期限切れのみ）" sub="忘れかけだけを出して効率よく固める" onClick={props.onStartReview} />
          <MenuButton label="自動再生" sub="最初の大量インプットに使う" onClick={props.onOpenAutoplay} />
          <MenuButton label="一覧" sub="全体を見渡して確認する" onClick={props.onOpenList} />
          <MenuButton label="成績確認" sub="覚えた・うろ覚え・未確認の人数を見る" onClick={props.onOpenStats} />
          <MenuButton label="バックアップ" sub="学習記録の保存と復元" onClick={props.onOpenBackup} />
          <MenuButton label="オプション" sub="表示や動作を調整する" onClick={props.onOpenOptions} />
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（アプリ）">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div><b>最初にやること</b></div>
          <div>最初は自動再生で顔を広く見てください。その後に学習へ入ると、初回から覚えやすくなります。</div>
          <div><b>迷ったときの基準</b></div>
          <div>3秒以内に出なければ、考え込まずに答えを見た方が効率が上がります。</div>
          <div><b>復習の役割</b></div>
          <div>復習は、すでに見た議員の中から忘れかけだけを出します。定着に最も大事な部分です。</div>
        </div>
      </HelpModal>
    </div>
  );
}

const commonBtn: React.CSSProperties = {
  width: "100%",
  padding: "14px 12px",
  borderRadius: 14,
};

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    background: "#f7f8fa",
  },
  card: {
    width: "min(760px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
  },
  titleRow: { width: "100%", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 },
  title: { fontSize: 40, fontWeight: 800, letterSpacing: 1 },
  titleSub: { fontSize: 14, color: "#555", marginTop: 4 },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  segment: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 },
  segmentBtn: { ...commonBtn, border: "1px solid #999", background: "#fff", fontSize: 16 },
  segmentActive: { ...commonBtn, border: "1px solid #0969da", background: "#eef6ff", fontSize: 16, fontWeight: 700 },
  targetLabel: { fontSize: 14, color: "#444", alignSelf: "flex-start" },
  guideBox: { width: "100%", border: "1px solid #d9e2f2", background: "#fff", borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12 },
  guideTitle: { fontSize: 18, fontWeight: 800 },
  stepGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  stepCard: { display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fbfcff" },
  stepNum: { minWidth: 28, height: 28, borderRadius: 999, background: "#eef6ff", border: "1px solid #b6d3ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0969da" },
  stepText: { fontSize: 13, color: "#555", marginTop: 4 },
  memoryBox: { borderRadius: 12, padding: 12, background: "#f7fafc", border: "1px solid #e5e7eb" },
  memoryTitle: { fontSize: 15, fontWeight: 800, marginBottom: 6 },
  memoryText: { fontSize: 14, color: "#444", lineHeight: 1.7 },
  menu: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  cardBtn: { ...commonBtn, border: "1px solid #d0d7de", background: "#fff", textAlign: "left" },
  primaryCardBtn: { ...commonBtn, border: "1px solid #0969da", background: "#eef6ff", textAlign: "left" },
  cardBtnTitle: { fontSize: 18, fontWeight: 800 },
  cardBtnSub: { fontSize: 13, color: "#555", marginTop: 6, lineHeight: 1.5 },
};
