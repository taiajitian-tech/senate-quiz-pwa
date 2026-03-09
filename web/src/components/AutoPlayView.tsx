import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import SafeImage from "./SafeImage";
import { loadOptions } from "./optionsStore";
import { parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";

type Props = {
  target: Target;
  onBack: () => void;
};

export default function AutoPlayView(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"face" | "answer">("face");
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = loadOptions();
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setItems(parsePersonsJson(json));
      } catch (e) {
        console.error(e);
        setError(String(e));
      }
    })();
  }, [dataUrl]);

  const current = useMemo(() => items[index] ?? null, [items, index]);

  useEffect(() => {
    if (!current) return;
    const ms = (phase === "face" ? options.faceSeconds : options.answerSeconds) * 1000;
    const timer = window.setTimeout(() => {
      if (phase === "face") setPhase("answer");
      else {
        setPhase("face");
        setIndex((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
      }
    }, ms);
    return () => window.clearTimeout(timer);
  }, [current, phase, options.faceSeconds, options.answerSeconds, items.length]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>自動再生</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]} / 顔 {options.faceSeconds}秒 → 名前 {options.answerSeconds}秒</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>
      <div style={styles.card}>
        {!current ? <div style={styles.center}>読み込み中</div> : (
          <>
            <div style={styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" /></div>
            {phase === "face" ? <div style={styles.faceOnly}>顔を見て、すぐ思い出してください</div> : (
              <div style={styles.answerBox}>
                <div style={styles.name}>{current.name}</div>
                <div style={styles.group}>{current.group ?? ""}</div>
              </div>
            )}
          </>
        )}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（自動再生）">
        <p>顔→名前を自動で流します。覚えた後の思い出す速さを鍛えるためのモードです。</p>
        <p>おすすめは、顔2秒・名前2秒です。慣れたら顔1秒にすると速さの練習になります。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  h1: { fontSize: 20, fontWeight: 800 },
  sub: { fontSize: 13, color: "#666" },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 420 },
  center: { margin: "auto", color: "#666", fontSize: 14 },
  imgBox: { display: "flex", justifyContent: "center" },
  img: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", objectFit: "cover", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  faceOnly: { fontSize: 18, fontWeight: 700, textAlign: "center" },
  answerBox: { display: "flex", flexDirection: "column", gap: 6, textAlign: "center" },
  name: { fontSize: 24, fontWeight: 800 },
  group: { fontSize: 15, color: "#555" },
};
