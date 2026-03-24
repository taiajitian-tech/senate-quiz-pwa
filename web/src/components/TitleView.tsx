import { useState } from "react";
import type { CSSProperties } from "react";
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
  tone?: "default" | "primary" | "guide";
  onClick: () => void;
};

function MenuButton(props: MenuButtonProps) {
  const buttonStyle = props.tone === "primary"
    ? styles.primaryCardBtn
    : props.tone === "guide"
      ? styles.guideCardBtn
      : styles.cardBtn;

  return (
    <button type="button" style={buttonStyle} onClick={props.onClick}>
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
            <div style={styles.titleSub}>まず見て、次に思い出す。順番どおりに覚える学習アプリ</div>
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

        <div style={styles.quickStartBox}>
          <div style={styles.quickStartTitle}>まず使う場所</div>
          <div style={styles.quickStartGrid}>
            <MenuButton tone="guide" label="最初に" sub="使い方と覚え方を先に確認する" onClick={props.onOpenFirstGuide} />
            <MenuButton tone="primary" label="学習" sub="基本モード。顔から名前を思い出す" onClick={props.onStartLearn} />
          </div>
        </div>

        <div style={styles.menuSectionTitle}>学習メニュー</div>
        <div style={styles.menu}>
          <MenuButton label="逆学習" sub="名前を見て顔を思い出す" onClick={props.onStartReverse} />
          <MenuButton label="復習" sub="忘れかけだけを出して定着させる" onClick={props.onStartReview} />
          <MenuButton label="自動再生" sub="最初の大量インプットに使う" onClick={props.onOpenAutoplay} />
          <MenuButton label="一覧" sub="全体を見渡して確認する" onClick={props.onOpenList} />
          <MenuButton label="成績確認" sub="覚えた・うろ覚え・未確認を確認する" onClick={props.onOpenStats} />
          <MenuButton label="バックアップ" sub="学習記録の保存と復元" onClick={props.onOpenBackup} />
          <MenuButton label="オプション" sub="表示や動作を調整する" onClick={props.onOpenOptions} />
        </div>

        <div style={styles.guideBox}>
          <div style={styles.guideTitle}>おすすめの順番</div>
          <div style={styles.stepGrid}>
            <div style={styles.stepCard}><div style={styles.stepNum}>1</div><div><b>自動再生</b><div style={styles.stepText}>まず多くの顔を一気に見る</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>2</div><div><b>学習</b><div style={styles.stepText}>顔を見て名前を思い出す</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>3</div><div><b>逆学習</b><div style={styles.stepText}>名前から顔も引けるようにする</div></div></div>
            <div style={styles.stepCard}><div style={styles.stepNum}>4</div><div><b>復習</b><div style={styles.stepText}>忘れかけを戻して定着させる</div></div></div>
          </div>
        </div>
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（アプリ）">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div><b>最初にやること</b></div>
          <div>最初にで流れを確認し、そのあと自動再生か学習へ入ると迷いにくくなります。</div>
          <div><b>迷ったときの基準</b></div>
          <div>3秒以内に出なければ考え込まず、答えを見て次へ進めた方が効率が上がります。</div>
          <div><b>復習の役割</b></div>
          <div>復習は、すでに見た議員の中から今ちょうど忘れかけの議員だけを出します。</div>
        </div>
      </HelpModal>
    </div>
  );
}

const commonBtn: CSSProperties = {
  width: "100%",
  padding: "14px 12px",
  borderRadius: 14,
};

const styles: Record<string, CSSProperties> = {
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
  quickStartBox: { width: "100%", border: "1px solid #d9e2f2", background: "#fff", borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12 },
  quickStartTitle: { fontSize: 18, fontWeight: 800 },
  quickStartGrid: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  menuSectionTitle: { width: "100%", fontSize: 18, fontWeight: 800 },
  guideBox: { width: "100%", border: "1px solid #d9e2f2", background: "#fff", borderRadius: 16, padding: 14, display: "flex", flexDirection: "column", gap: 12 },
  guideTitle: { fontSize: 18, fontWeight: 800 },
  stepGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  stepCard: { display: "flex", gap: 10, alignItems: "flex-start", border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fbfcff" },
  stepNum: { minWidth: 28, height: 28, borderRadius: 999, background: "#eef6ff", border: "1px solid #b6d3ff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: "#0969da" },
  stepText: { fontSize: 13, color: "#555", marginTop: 4 },
  menu: { width: "100%", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  cardBtn: { ...commonBtn, border: "1px solid #d0d7de", background: "#fff", textAlign: "left" },
  primaryCardBtn: { ...commonBtn, border: "1px solid #0969da", background: "#eef6ff", textAlign: "left" },
  guideCardBtn: { ...commonBtn, border: "1px solid #d4a72c", background: "#fff8db", textAlign: "left" },
  cardBtnTitle: { fontSize: 18, fontWeight: 800 },
  cardBtnSub: { fontSize: 13, color: "#555", marginTop: 6, lineHeight: 1.5 },
};
