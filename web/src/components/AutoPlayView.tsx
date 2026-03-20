import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import SafeImage from "./SafeImage";
import { loadOptions } from "./optionsStore";
import { formatNameWithKana, parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";

type Props = {
  target: Target;
  onBack: () => void;
};

type AutoPlayMemory = {
  index: number;
  phase: "face" | "answer";
  paused: boolean;
};

const getAutoPlayMemoryKey = (target: Target) => `senateQuiz.autoplay.${target}.v1`;

function loadAutoPlayMemory(target: Target): AutoPlayMemory {
  try {
    const raw = localStorage.getItem(getAutoPlayMemoryKey(target));
    if (!raw) return { index: 0, phase: "face", paused: false };
    const parsed = JSON.parse(raw) as Partial<AutoPlayMemory>;
    return {
      index: Number.isFinite(Number(parsed.index)) ? Math.max(0, Math.floor(Number(parsed.index))) : 0,
      phase: parsed.phase === "answer" ? "answer" : "face",
      paused: parsed.paused === true,
    };
  } catch {
    return { index: 0, phase: "face", paused: false };
  }
}

function saveAutoPlayMemory(target: Target, value: AutoPlayMemory) {
  try {
    localStorage.setItem(getAutoPlayMemoryKey(target), JSON.stringify(value));
  } catch {
    // ignore
  }
}

export default function AutoPlayView(props: Props) {
  const initialMemory = useMemo(() => loadAutoPlayMemory(props.target), [props.target]);
  const [items, setItems] = useState<Person[]>([]);
  const [index, setIndex] = useState(initialMemory.index);
  const [phase, setPhase] = useState<"face" | "answer">(initialMemory.phase);
  const [paused, setPaused] = useState(initialMemory.paused);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = loadOptions();
  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    const memory = loadAutoPlayMemory(props.target);
    setIndex(memory.index);
    setPhase(memory.phase);
    setPaused(memory.paused);
  }, [props.target]);

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

  useEffect(() => {
    if (items.length === 0) return;
    if (index < items.length) return;
    setIndex(items.length - 1);
  }, [items, index]);

  useEffect(() => {
    saveAutoPlayMemory(props.target, { index, phase, paused });
  }, [props.target, index, phase, paused]);

  const current = useMemo(() => items[index] ?? null, [items, index]);
  const progressText = items.length === 0 ? "0 / 0" : `${index + 1} / ${items.length}`;

  useEffect(() => {
    if (!current || paused) return;
    const ms = (phase === "face" ? options.faceSeconds : options.answerSeconds) * 1000;
    const timer = window.setTimeout(() => {
      if (phase === "face") {
        setPhase("answer");
        return;
      }
      setPhase("face");
      setIndex((prev) => (items.length === 0 ? 0 : (prev + 1) % items.length));
    }, ms);
    return () => window.clearTimeout(timer);
  }, [current, paused, phase, options.faceSeconds, options.answerSeconds, items.length]);

  const handleReset = () => {
    setIndex(0);
    setPhase("face");
    setPaused(true);
  };

  const handlePrev = () => {
    if (items.length === 0) return;
    setIndex((prev) => (prev <= 0 ? 0 : prev - 1));
    setPhase("face");
    setPaused(true);
  };

  const handleNext = () => {
    if (items.length === 0) return;
    setIndex((prev) => (prev >= items.length - 1 ? items.length - 1 : prev + 1));
    setPhase("face");
    setPaused(true);
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>自動再生</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]} / 顔 {options.faceSeconds}秒 → 名前 {options.answerSeconds}秒</div>
        <div style={styles.sub}>前回の位置を保存します。停止して戻っても、続きから再開できます。</div>
        <div style={styles.statusRow}>
          <div style={styles.progress}>{progressText}</div>
          <div style={styles.phaseBadge}>{phase === "face" ? "顔表示中" : "名前表示中"}</div>
          <div style={styles.phaseBadge}>{paused ? "一時停止中" : "再生中"}</div>
        </div>
        <div style={styles.controls}>
          <button type="button" style={styles.controlBtn} onClick={() => setPaused((prev) => !prev)} disabled={!current}>
            {paused ? "再開" : "一時停止"}
          </button>
          <button type="button" style={styles.controlBtn} onClick={handlePrev} disabled={!current || index === 0}>前へ</button>
          <button type="button" style={styles.controlBtn} onClick={handleNext} disabled={!current || items.length === 0 || index >= items.length - 1}>次へ</button>
          <button type="button" style={styles.controlBtn} onClick={handleReset} disabled={!current}>最初から</button>
        </div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>
      <div style={styles.card}>
        {!current ? <div style={styles.center}>読み込み中</div> : (
          <>
            <div style={styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" /></div>
            {phase === "face" ? <div style={styles.faceOnly}>顔を見て、すぐ思い出してください</div> : (
              <div style={styles.answerBox}>
                <div style={styles.name}>{formatNameWithKana(current)}</div>
                <div style={styles.group}>{current.group ?? ""}</div>
              </div>
            )}
          </>
        )}
      </div>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（自動再生）">
        <p>顔→名前を自動で流します。覚えた後の思い出す速さを鍛えるためのモードです。</p>
        <p>一時停止、再開、前へ、次へ、最初から に対応しています。</p>
        <p>再生位置は保存されるため、途中でやめても次回は続きから再開できます。</p>
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
  statusRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  progress: { fontSize: 13, color: "#333", padding: "6px 10px", borderRadius: 999, background: "#f3f4f6", border: "1px solid #d1d5db" },
  phaseBadge: { fontSize: 13, color: "#333", padding: "6px 10px", borderRadius: 999, background: "#fff", border: "1px solid #d1d5db" },
  controls: { display: "flex", flexWrap: "wrap", gap: 8 },
  controlBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 700 },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 420 },
  center: { margin: "auto", color: "#666", fontSize: 14 },
  imgBox: { display: "flex", justifyContent: "center" },
  img: { width: "min(420px, 88vw)", height: "min(420px, 88vw)", objectFit: "cover", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "min(420px, 88vw)", height: "min(420px, 88vw)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  faceOnly: { fontSize: 18, fontWeight: 700, textAlign: "center" },
  answerBox: { display: "flex", flexDirection: "column", gap: 6, textAlign: "center" },
  name: { fontSize: 24, fontWeight: 800 },
  group: { fontSize: 15, color: "#555" },
};
