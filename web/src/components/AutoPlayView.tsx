import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import SafeImage from "./SafeImage";
import { loadOptions } from "./optionsStore";
import { formatDisplayName, formatLearningSubline, getTargetLabels, loadPersonsForTarget, type AppMode, type Person, type Target } from "./data";

type Props = {
  appMode: AppMode;
  target: Target;
  onBack: () => void;
};

type Phase = "face" | "answer";

type SavedState = {
  sequence: number[];
  position: number;
  phase: Phase;
  paused: boolean;
  random: boolean;
};

const storageKey = (mode: AppMode, target: Target) => `autoplay-state:${mode}:${target}`;

function shuffleIndices(length: number) {
  const arr = Array.from({ length }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function readSavedState(mode: AppMode, target: Target): SavedState | null {
  try {
    const raw = localStorage.getItem(storageKey(mode, target));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedState>;
    if (!Array.isArray(parsed.sequence)) return null;
    return {
      sequence: parsed.sequence.filter((v): v is number => Number.isInteger(v) && v >= 0),
      position: Number.isInteger(parsed.position) ? Math.max(0, parsed.position as number) : 0,
      phase: parsed.phase === "answer" ? "answer" : "face",
      paused: Boolean(parsed.paused),
      random: Boolean(parsed.random),
    };
  } catch {
    return null;
  }
}

function writeSavedState(mode: AppMode, target: Target, state: SavedState) {
  try {
    localStorage.setItem(storageKey(mode, target), JSON.stringify(state));
  } catch {
    // ignore storage errors
  }
}

export default function AutoPlayView(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [sequence, setSequence] = useState<number[]>([]);
  const [position, setPosition] = useState(0);
  const [phase, setPhase] = useState<Phase>("face");
  const [paused, setPaused] = useState(false);
  const [randomMode, setRandomMode] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const options = loadOptions();
  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    (async () => {
      try {
        const parsed = await loadPersonsForTarget(baseUrl, props.target, props.appMode);
        setItems(parsed);

        const saved = readSavedState(props.appMode, props.target);
        const maxIndex = parsed.length - 1;
        const validSequence =
          saved &&
          saved.sequence.length === parsed.length &&
          saved.sequence.every((n) => n >= 0 && n <= maxIndex);

        const nextSequence = validSequence
          ? saved.sequence
          : (saved?.random ? shuffleIndices(parsed.length) : Array.from({ length: parsed.length }, (_, i) => i));

        setSequence(nextSequence);
        setPosition(saved ? Math.min(saved.position, Math.max(0, nextSequence.length - 1)) : 0);
        setPhase(saved?.phase ?? "face");
        setPaused(saved?.paused ?? false);
        setRandomMode(saved?.random ?? false);
      } catch (e) {
        console.error(e);
        setError(String(e));
      }
    })();
  }, [baseUrl, props.appMode, props.target]);

  const compactLayout = typeof window !== "undefined" && (window.innerHeight <= 820 || window.innerWidth <= 480);

  const currentIndex = sequence[position] ?? 0;
  const current = useMemo(() => items[currentIndex] ?? null, [items, currentIndex]);

  useEffect(() => {
    if (items.length === 0 || sequence.length === 0) return;
    writeSavedState(props.appMode, props.target, {
      sequence,
      position,
      phase,
      paused,
      random: randomMode,
    });
  }, [items.length, sequence, position, phase, paused, randomMode, props.appMode, props.target]);

  useEffect(() => {
    if (!current || paused) return;
    const ms = (phase === "face" ? options.faceSeconds : options.answerSeconds) * 1000;
    const timer = window.setTimeout(() => {
      if (phase === "face") {
        setPhase("answer");
        return;
      }
      setPhase("face");
      setPosition((prev) => {
        if (sequence.length === 0) return 0;
        return (prev + 1) % sequence.length;
      });
    }, ms);
    return () => window.clearTimeout(timer);
  }, [current, phase, paused, options.faceSeconds, options.answerSeconds, sequence.length]);

  function move(delta: 1 | -1) {
    if (sequence.length === 0) return;
    setPhase("face");
    setPosition((prev) => {
      const next = prev + delta;
      if (next < 0) return sequence.length - 1;
      if (next >= sequence.length) return 0;
      return next;
    });
  }

  function restart() {
    setPhase("face");
    setPaused(false);
    setPosition(0);
  }

  function toggleRandomMode() {
    if (items.length === 0) return;
    const nextRandom = !randomMode;
    const nextSequence = nextRandom
      ? shuffleIndices(items.length)
      : Array.from({ length: items.length }, (_, i) => i);
    setRandomMode(nextRandom);
    setSequence(nextSequence);
    setPosition(0);
    setPhase("face");
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>自動再生</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{getTargetLabels(props.appMode)[props.target]} / 顔 {options.faceSeconds}秒 → 名前 {options.answerSeconds}秒</div>
        <div style={styles.sub}>{compactLayout ? `再生順：${randomMode ? "ランダム" : "通常"} / ${sequence.length === 0 ? 0 : position + 1} / ${sequence.length}` : `再生順：${randomMode ? "ランダム" : "通常"} / 保存位置：${sequence.length === 0 ? 0 : position + 1} / ${sequence.length}`}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={compactLayout ? styles.controlsCompact : styles.controls}>
        <button type="button" style={styles.ctrlBtn} onClick={() => move(-1)} disabled={sequence.length === 0}>前へ</button>
        <button type="button" style={styles.ctrlBtn} onClick={() => setPaused((prev) => !prev)} disabled={sequence.length === 0}>{paused ? "再開" : "一時停止"}</button>
        <button type="button" style={styles.ctrlBtn} onClick={() => move(1)} disabled={sequence.length === 0}>次へ</button>
        <button type="button" style={styles.ctrlBtn} onClick={restart} disabled={sequence.length === 0}>最初から</button>
        <button type="button" style={{ ...styles.ctrlBtn, ...(randomMode ? styles.ctrlBtnActive : null) }} onClick={toggleRandomMode} disabled={items.length === 0}>{randomMode ? "ランダム中" : "ランダム再生"}</button>
      </div>

      <div style={styles.card}>
        {!current ? <div style={styles.center}>読み込み中</div> : (
          <>
            <div style={styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" /></div>
            {phase === "face" ? <div style={styles.faceOnly}>顔を見て、すぐ思い出してください</div> : (
              <div style={styles.answerBox}>
                <div style={styles.name}>{formatDisplayName(current, props.target, props.appMode, items)}</div>
                <div style={styles.group}>{formatLearningSubline(current, props.target, props.appMode)}</div>
              </div>
            )}
          </>
        )}
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（自動再生）">
        <p>顔→名前を自動で流します。覚えた後の思い出す速さを鍛えるためのモードです。</p>
        <p>一時停止・再開・前へ・次へ・最初からに対応しています。途中で閉じても保存位置から再開します。</p>
        <p>ランダム再生を押すと、現在の対象だけをランダム順で流します。ランダム順も保存されます。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100dvh", padding: 8, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", background: "#f7f8fa", overflow: "hidden" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 5, background: "#fff", border: "1px solid #ddd", borderRadius: 14, padding: 8 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: "8px 11px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 12 },
  helpBtn: { padding: "8px 11px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 40, fontSize: 14 },
  controls: { width: "min(720px, 100%)", display: "flex", flexWrap: "wrap", gap: 8 },
  controlsCompact: { width: "min(720px, 100%)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 6 },
  ctrlBtn: { padding: "9px 10px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 12 },
  ctrlBtnActive: { background: "#e8f0fe", borderColor: "#8ab4f8" },
  h1: { fontSize: "clamp(17px, 4.8vw, 20px)", fontWeight: 800 },
  sub: { fontSize: 11, color: "#666", lineHeight: 1.4 },
  card: { width: "min(720px, 100%)", flex: 1, minHeight: 0, border: "1px solid #ddd", borderRadius: 14, padding: 8, display: "flex", flexDirection: "column", gap: 8, background: "#fff", overflow: "hidden" },
  center: { margin: "auto", color: "#666", fontSize: 14 },
  imgBox: { flex: 1, minHeight: 0, display: "flex", justifyContent: "center", alignItems: "center" },
  img: { width: "100%", height: "100%", maxWidth: "min(420px, 88vw)", maxHeight: "min(44dvh, 380px)", objectFit: "contain", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "100%", height: "100%", maxWidth: "min(420px, 88vw)", maxHeight: "min(44dvh, 380px)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  faceOnly: { fontSize: "clamp(15px, 4.5vw, 18px)", fontWeight: 700, textAlign: "center", lineHeight: 1.4 },
  answerBox: { display: "flex", flexDirection: "column", gap: 4, textAlign: "center", flex: "0 0 auto" },
  name: { fontSize: "clamp(22px, 6vw, 24px)", fontWeight: 800, lineHeight: 1.2 },
  group: { fontSize: 13, color: "#555", lineHeight: 1.4 },
};
