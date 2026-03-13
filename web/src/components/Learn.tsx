import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadProgress, saveProgress } from "./learnStorage";
import { bumpStats } from "./stats";
import { loadMasteredIds, loadWrongIds, saveMasteredIds, saveWrongIds } from "./progress";
import { parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";
import SafeImage from "./SafeImage";

type Mode = "learn" | "review" | "reverse";

type Props = {
  mode: Mode;
  target: Target;
  onBackTitle: () => void;
};

type SessionResult = {
  total: number;
  remembered: number;
  hazy: number;
  notRemembered: number;
};

const SESSION_SIZE = 30;

function pickNext(
  items: Person[],
  progress: Record<number, ProgressItem>,
  now: number,
  mode: Mode,
  askedIds: Set<number>
) {
  if (items.length === 0) return null;

  const due: Person[] = [];
  const fresh: Person[] = [];
  let nearest: { s: Person; due: number } | null = null;

  for (const s of items) {
    if (askedIds.has(s.id)) continue;

    const p = progress[s.id];
    if (!p) {
      if (mode !== "review") fresh.push(s);
      continue;
    }

    if (p.due <= now) due.push(s);
    if (!nearest || p.due < nearest.due) nearest = { s, due: p.due };
  }

  if (due.length > 0) return due[Math.floor(Math.random() * due.length)];
  if (mode === "review") return null;
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  return nearest?.s ?? null;
}

export default function Learn(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Person[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress(props.target));
  const [askedIds, setAskedIds] = useState<number[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult>({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
  const [sessionDone, setSessionDone] = useState(false);
  const [viewport, setViewport] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 390,
    height: typeof window !== "undefined" ? window.innerHeight : 844,
  }));

  const isCompact = viewport.width <= 480 || viewport.height <= 780;

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    setProgress(loadProgress(props.target));
    setAskedIds([]);
    setSessionResult({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
    setSessionDone(false);
    setRevealed(false);
  }, [props.target, props.mode]);

  useEffect(() => {
    const onResize = () => {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setItems(parsePersonsJson(json));
      } catch (e) {
        console.error(e);
        setItems([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const askedIdSet = useMemo(() => new Set(askedIds), [askedIds]);
  const current = useMemo(() => {
    if (sessionDone || askedIds.length >= SESSION_SIZE) return null;
    return pickNext(items, progress, Date.now(), props.mode, askedIdSet);
  }, [items, progress, props.mode, askedIdSet, askedIds.length, sessionDone]);

  useEffect(() => {
    if (loading) return;
    if (!sessionDone && askedIds.length > 0 && (askedIds.length >= SESSION_SIZE || !current)) {
      setSessionDone(true);
      setRevealed(false);
    }
  }, [askedIds.length, current, loading, sessionDone]);

  const onGrade = (grade: Grade) => {
    if (!current) return;
    const now = Date.now();
    const prev = progress[current.id];
    const next = applyGrade(prev, current.id, grade, now);
    const nextMap = { ...progress, [current.id]: next };
    setProgress(nextMap);
    saveProgress(props.target, nextMap);
    appendHistory(props.target, { at: now, id: current.id, grade });
    bumpStats(props.target, {
      playedTotal: 1,
      correctTotal: grade === "again" ? 0 : 1,
      wrongTotal: grade === "again" ? 1 : 0,
      masteredCount: grade === "good" && next.reps >= 4 ? 1 : 0,
    });

    const wrong = new Set(loadWrongIds(props.target));
    const mastered = new Set(loadMasteredIds(props.target));
    if (grade === "again") wrong.add(current.id); else wrong.delete(current.id);
    if (grade === "good" && next.reps >= 4) mastered.add(current.id);
    saveWrongIds(props.target, [...wrong]);
    saveMasteredIds(props.target, [...mastered]);

    setAskedIds((prevAsked) => [...prevAsked, current.id]);
    setSessionResult((prevResult) => ({
      total: prevResult.total + 1,
      remembered: prevResult.remembered + (grade === "good" ? 1 : 0),
      hazy: prevResult.hazy + (grade === "hard" ? 1 : 0),
      notRemembered: prevResult.notRemembered + (grade === "again" ? 1 : 0),
    }));
    setRevealed(false);
  };

  const resetSession = () => {
    setAskedIds([]);
    setSessionResult({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
    setSessionDone(false);
    setRevealed(false);
  };

  const titleMap: Record<Mode, string> = {
    learn: "学習（顔→名前）",
    review: "復習（忘れかけだけ）",
    reverse: "逆学習（名前→顔）",
  };

  const modeHelp: Record<Mode, string> = {
    learn: "基本の学習です。顔を見て名前を思い出す力を付けます。",
    review: "忘れかけだけを出します。短時間で定着しやすいモードです。",
    reverse: "名前から顔も引けるようにして、記憶の結び付きを強くします。",
  };

  return (
    <div style={isCompact ? styles.wrapCompact : styles.wrap}>
      <div style={isCompact ? styles.headerCompact : styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBackTitle}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>{titleMap[props.mode]}</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <div style={styles.modeDesc}>{modeHelp[props.mode]}</div>
        <div style={isCompact ? styles.progressBoxCompact : styles.progressBox}>今回のセット {Math.min(askedIds.length, SESSION_SIZE)} / {SESSION_SIZE}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={isCompact ? styles.cardCompact : styles.card}>
        {loading ? <div style={styles.center}>読み込み中</div> : sessionDone ? (
          <div style={styles.doneWrap}>
            <div style={styles.doneTitle}>今回の出題は終了です</div>
            <div style={styles.doneSub}>結果を確認して、次のセットへ進めます。</div>
            <div style={styles.resultGrid}>
              <div style={styles.resultCard}><div style={styles.resultLabel}>出題数</div><div style={styles.resultValue}>{sessionResult.total}</div></div>
              <div style={styles.resultCard}><div style={styles.resultLabel}>覚えていた</div><div style={styles.resultValue}>{sessionResult.remembered}</div></div>
              <div style={styles.resultCard}><div style={styles.resultLabel}>うろ覚え</div><div style={styles.resultValue}>{sessionResult.hazy}</div></div>
              <div style={styles.resultCard}><div style={styles.resultLabel}>覚えていない</div><div style={styles.resultValue}>{sessionResult.notRemembered}</div></div>
            </div>
            <div style={styles.doneBtns}>
              <button type="button" style={styles.primaryBtn} onClick={resetSession}>次の出題へ</button>
              <button type="button" style={styles.btn} onClick={props.onBackTitle}>終了してタイトルへ戻る</button>
            </div>
          </div>
        ) : !current ? (
          <div style={styles.center}>{props.mode === "review" ? "今は忘れかけの復習がありません。" : "出題できるデータがありません。"}</div>
        ) : (
          <>
            {props.mode === "reverse" ? (
              <div style={styles.block}>
                <div style={isCompact ? styles.answerNameCompact : styles.answerName}>{current.name}</div>
                <div style={isCompact ? styles.answerGroupCompact : styles.answerGroup}>{current.group ?? ""}</div>
                {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                {!revealed ? (
                  <>
                    <div style={isCompact ? styles.msgCompact : styles.msg}>顔を思い出してから、答えを表示してください。</div>
                    <button type="button" style={isCompact ? styles.primaryBtnCompact : styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </>
                ) : (
                  <>
                    <div style={isCompact ? styles.imgBoxCompact : styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={isCompact ? styles.imgCompact : styles.img} fallbackStyle={isCompact ? styles.noImgCompact : styles.noImg} fallbackText="画像なし" /></div>
                    <div style={isCompact ? styles.gradeBtnsCompact : styles.gradeBtns}>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("good")}>覚えていた</button>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("hard")}>うろ覚え</button>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("again")}>覚えていない</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div style={isCompact ? styles.imgBoxCompact : styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={isCompact ? styles.imgCompact : styles.img} fallbackStyle={isCompact ? styles.noImgCompact : styles.noImg} fallbackText="画像なし" /></div>
                {!revealed ? (
                  <div style={styles.block}>
                    <div style={isCompact ? styles.msgCompact : styles.msg}>名前を思い出してから、答えを表示してください。</div>
                    <button type="button" style={isCompact ? styles.primaryBtnCompact : styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </div>
                ) : (
                  <div style={styles.block}>
                    <div style={isCompact ? styles.answerNameCompact : styles.answerName}>{current.name}</div>
                    <div style={isCompact ? styles.answerGroupCompact : styles.answerGroup}>{current.group ?? ""}</div>
                    {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                    <div style={isCompact ? styles.gradeBtnsCompact : styles.gradeBtns}>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("good")}>覚えていた</button>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("hard")}>うろ覚え</button>
                      <button type="button" style={isCompact ? styles.btnCompact : styles.btn} onClick={() => onGrade("again")}>覚えていない</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <HelpModal open={helpOpen} title="このモードの使い方" onClose={() => setHelpOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div><b>このモードの役割</b></div>
          <div>{modeHelp[props.mode]}</div>
          <div><b>判定の基準</b></div>
          <div>覚えていた：3秒以内に出た</div>
          <div>うろ覚え：少し迷った、部分的に出た</div>
          <div>覚えていない：出ない、別人と混ざる</div>
          <div><b>記憶の定着</b></div>
          <div>答えを見た後に自己判定し、忘れかけのものが後でまた出ることで定着します。</div>
        </div>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100dvh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", background: "#f7f8fa" },
  wrapCompact: { minHeight: "100dvh", padding: 10, display: "flex", flexDirection: "column", gap: 8, alignItems: "center", background: "#f7f8fa" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerCompact: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 6 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  h1: { fontSize: 20, fontWeight: 800 },
  sub: { fontSize: 13, color: "#666" },
  modeDesc: { fontSize: 14, color: "#444" },
  progressBox: { alignSelf: "flex-start", padding: "6px 10px", borderRadius: 999, background: "#eef6ff", border: "1px solid #c8ddff", fontSize: 13, color: "#0958b3" },
  progressBoxCompact: { alignSelf: "flex-start", padding: "5px 8px", borderRadius: 999, background: "#eef6ff", border: "1px solid #c8ddff", fontSize: 12, color: "#0958b3" },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 320, background: "#fff" },
  cardCompact: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 10, display: "flex", flexDirection: "column", gap: 8, minHeight: "calc(100dvh - 136px)", background: "#fff", overflow: "hidden" },
  center: { margin: "auto", color: "#666", fontSize: 14 },
  imgBox: { display: "flex", justifyContent: "center" },
  imgBoxCompact: { display: "flex", justifyContent: "center" },
  img: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", objectFit: "cover", borderRadius: 12, background: "#f3f3f3" },
  imgCompact: { width: "min(210px, 56vw)", height: "min(210px, 56vw)", objectFit: "cover", borderRadius: 10, background: "#f3f3f3" },
  noImg: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  noImgCompact: { width: "min(210px, 56vw)", height: "min(210px, 56vw)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 10 },
  block: { display: "flex", flexDirection: "column", gap: 10, flex: 1, justifyContent: "center" },
  msg: { fontSize: 15 },
  msgCompact: { fontSize: 13, textAlign: "center" },
  primaryBtn: { padding: "14px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontSize: 18, fontWeight: 700 },
  primaryBtnCompact: { padding: "11px 10px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontSize: 16, fontWeight: 700 },
  answerName: { fontSize: 24, fontWeight: 800, textAlign: "center" },
  answerNameCompact: { fontSize: 20, fontWeight: 800, textAlign: "center", lineHeight: 1.25 },
  answerGroup: { fontSize: 15, color: "#555", textAlign: "center" },
  answerGroupCompact: { fontSize: 13, color: "#555", textAlign: "center", lineHeight: 1.3 },
  guessBadge: { alignSelf: "center", padding: "4px 10px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
  gradeBtns: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  gradeBtnsCompact: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 },
  btn: { padding: "12px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
  btnCompact: { padding: "10px 6px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 13, lineHeight: 1.25 },
  doneWrap: { display: "flex", flexDirection: "column", gap: 12 },
  doneTitle: { fontSize: 24, fontWeight: 800, textAlign: "center" },
  doneSub: { fontSize: 14, color: "#555", textAlign: "center" },
  resultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  resultCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafbfc" },
  resultLabel: { fontSize: 13, color: "#666" },
  resultValue: { fontSize: 24, fontWeight: 800, marginTop: 6 },
  doneBtns: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
};
