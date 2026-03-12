import HelpModal from "./HelpModal";

export const FIRST_GUIDE_SEEN_KEY = "senateQuiz:firstGuideSeen:v1";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FirstGuide(props: Props) {
  return (
    <HelpModal open={props.open} onClose={props.onClose} title="最初に（使い方）">
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>このアプリは、顔と名前を何度も結び付けて、少しずつ定着させる構成です。</div>

        <div style={styles.box}>
          <div style={styles.boxTitle}>おすすめの順番</div>
          <div style={styles.step}><b>1 自動再生</b><span>最初に多くの顔を一気に見ます。初回のインプットです。</span></div>
          <div style={styles.step}><b>2 学習（顔→名前）</b><span>顔を見て名前を思い出します。基本の練習です。</span></div>
          <div style={styles.step}><b>3 逆学習（名前→顔）</b><span>名前から顔も引けるようにして、結び付きを強くします。</span></div>
          <div style={styles.step}><b>4 復習</b><span>忘れかけだけを出して、短い時間で定着させます。</span></div>
        </div>

        <div style={styles.box}>
          <div style={styles.boxTitle}>記憶の定着の仕方</div>
          <div>顔と名前は、最初から強く覚えるより、<b>何回か思い出す</b>ことで結び付きます。</div>
          <div>このアプリでは、次の流れで定着を作ります。</div>
          <div style={styles.step}><b>多くの顔を見る</b><span>最初に全体像を作ります。</span></div>
          <div style={styles.step}><b>すぐ思い出す</b><span>顔を見て名前を引く回数を増やします。</span></div>
          <div style={styles.step}><b>忘れかけで復習する</b><span>少し忘れた頃にもう一度出すと、定着しやすくなります。</span></div>
        </div>

        <div style={styles.box}>
          <div style={styles.boxTitle}>判定の目安</div>
          <div>覚えていた：3秒以内にほぼ確信で出た</div>
          <div>うろ覚え：少し迷った、苗字だけ、答えを見て分かった</div>
          <div>覚えていない：出ない、別人と混ざる、答えを見ても弱い</div>
        </div>

        <div style={styles.note}>長く考え込むより、早めに答えを見て次へ進む方が、多くの顔を覚えやすくなります。</div>
      </div>
    </HelpModal>
  );
}

const styles: Record<string, React.CSSProperties> = {
  box: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#fafbfc" },
  boxTitle: { fontSize: 16, fontWeight: 800 },
  step: { display: "flex", flexDirection: "column", gap: 2 },
  note: { padding: 10, borderRadius: 10, background: "#eef6ff", border: "1px solid #c8ddff" },
};
