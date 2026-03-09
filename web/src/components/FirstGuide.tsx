import HelpModal from "./HelpModal";

export const FIRST_GUIDE_SEEN_KEY = "senateQuiz:firstGuideSeen:v1";

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function FirstGuide(props: Props) {
  return (
    <HelpModal open={props.open} onClose={props.onClose} title="最初に（使い方）">
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>このアプリは、顔と名前をすばやく結び付けて覚えるための学習アプリです。</div>
        <div><b>おすすめの順番</b></div>
        <div>① 自動再生で全体を見る</div>
        <div>② 学習で顔→名前を思い出す</div>
        <div>③ 逆学習で名前→顔も確認する</div>
        <div>④ 復習で忘れかけを定着させる</div>
        <div><b>大事な使い方</b></div>
        <div>3秒以内に出ないときは、考え込まずに答えを見て次へ進んでください。</div>
        <div>長く考えるより、多くの顔を何度も見た方が覚えやすいです。</div>
        <div><b>自己判定の目安</b></div>
        <div>覚えていた：3秒以内にほぼ確信で出た</div>
        <div>うろ覚え：少し迷った、苗字だけ、答えを見て「ああそれだ」</div>
        <div>覚えていない：出ない、別人と混ざる、答えを見ても弱い</div>
      </div>
    </HelpModal>
  );
}
