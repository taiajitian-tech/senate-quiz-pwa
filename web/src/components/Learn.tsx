import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadProgress, saveProgress } from "./learnStorage";
import { bumpStats } from "./stats";
import { loadMasteredIds, loadWrongIds, saveMasteredIds, saveWrongIds } from "./progress";
import { formatNameWithKana, parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";
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
    <div style={styles.wrap}>
      <div style={styles.shell}>
        <div style={styles.header}>
          <div style={styles.topRow}>
            <button type="button" style={styles.backBtn} onClick={props.onBackTitle}>タイトルへ戻る</button>
            <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
          </div>
          <div style={styles.h1}>{titleMap[props.mode]}</div>
          <div style={styles.subRow}>
            <div style={styles.sub}>{targetLabels[props.target]}</div>
            <div style={styles.progressBox}>{Math.min(askedIds.length, SESSION_SIZE)} / {SESSION_SIZE}</div>
          </div>
          <div style={styles.modeDesc}>{modeHelp[props.mode]}</div>
          {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
        </div>

        <div style={styles.card}>
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
          ) : props.mode === "reverse" ? (
            <div style={styles.quizLayout}>
              <div style={styles.infoZone}>
                <div style={styles.answerName}>{formatNameWithKana(current)}</div>
                <div style={styles.answerGroup}>{current.group ?? ""}</div>
                {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                {!revealed ? (
                  <div style={styles.promptBox}>
                    <div style={styles.msg}>顔を思い出してから、答えを表示してください。</div>
                    <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </div>
                ) : null}
              </div>
              <div style={styles.imageZone}>
                {revealed ? (
                  <div style={styles.imgBox}>
                    <SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" />
                  </div>
                ) : (
                  <div style={styles.placeholderBox}>表示前</div>
                )}
              </div>
              <div style={styles.actionZone}>
                {revealed ? (
                  <div style={styles.gradeBtns}>
                    <button type="button" style={styles.btnRemembered} onClick={() => onGrade("good")}>覚えていた</button>
                    <button type="button" style={styles.btnHazy} onClick={() => onGrade("hard")}>うろ覚え</button>
                    <button type="button" style={styles.btnForgot} onClick={() => onGrade("again")}>覚えていない</button>
                  </div>
                ) : <div style={styles.actionSpacer} />}
              </div>
            </div>
          ) : (
            <div style={styles.quizLayout}>
              <div style={styles.imageZone}>
                <div style={styles.imgBox}>
                  <SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" />
                </div>
              </div>
              <div style={styles.infoZone}>
                {!revealed ? (
                  <div style={styles.promptBox}>
                    <div style={styles.msg}>名前を思い出してから、答えを表示してください。</div>
                    <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </div>
                ) : (
                  <>
                    <div style={styles.answerName}>{formatNameWithKana(current)}</div>
                    <div style={styles.answerGroup}>{current.group ?? ""}</div>
                    {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                  </>
                )}
              </div>
              <div style={styles.actionZone}>
                {revealed ? (
                  <div style={styles.gradeBtns}>
                    <button type="button" style={styles.btnRemembered} onClick={() => onGrade("good")}>覚えていた</button>
                    <button type="button" style={styles.btnHazy} onClick={() => onGrade("hard")}>うろ覚え</button>
                    <button type="button" style={styles.btnForgot} onClick={() => onGrade("again")}>覚えていない</button>
                  </div>
                ) : <div style={styles.actionSpacer} />}
              </div>
            </div>
          )}
        </div>
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
  wrap: { minHeight: "100dvh", background: "#f7f8fa", padding: 8, overflow: "hidden" },
  shell: { width: "min(720px, 100%)", margin: "0 auto", minHeight: "calc(100dvh - 16px)", display: "flex", flexDirection: "column", gap: 8 },
  header: { display: "flex", flexDirection: "column", gap: 6, background: "#fff", border: "1px solid #ddd", borderRadius: 14, padding: 10, flex: "0 0 auto" },
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  backBtn: { padding: "9px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 13 },
  helpBtn: { padding: "9px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 42, fontSize: 15 },
  h1: { fontSize: 18, fontWeight: 800, lineHeight: 1.25 },
  subRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sub: { fontSize: 12, color: "#555" },
  modeDesc: { fontSize: 12, color: "#444", lineHeight: 1.5 },
  progressBox: { padding: "4px 10px", borderRadius: 999, background: "#eef6ff", border: "1px solid #c8ddff", fontSize: 12, color: "#0958b3", fontWeight: 700, whiteSpace: "nowrap" },
  card: { flex: 1, minHeight: 0, border: "1px solid #ddd", borderRadius: 14, padding: 10, background: "#fff", display: "flex", overflow: "hidden" },
  center: { margin: "auto", color: "#666", fontSize: 14, textAlign: "center" },
  quizLayout: { display: "grid", gridTemplateRows: "minmax(0, 45vh) auto auto", gap: 10, width: "100%", minHeight: 0 },
  imageZone: { minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  imgBox: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%", maxHeight: "45vh", objectFit: "contain", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "100%", height: "100%", maxHeight: "45vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  placeholderBox: { width: "100%", height: "100%", maxHeight: "45vh", borderRadius: 12, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#888", fontSize: 14 },
  infoZone: { display: "flex", flexDirection: "column", gap: 6, alignItems: "center", justifyContent: "center", textAlign: "center" },
  promptBox: { width: "100%", display: "flex", flexDirection: "column", gap: 8, alignItems: "stretch" },
  msg: { fontSize: 14, color: "#222", lineHeight: 1.5, textAlign: "center" },
  primaryBtn: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #0969da", background: "#eef6ff", fontSize: 17, fontWeight: 700 },
  answerName: { fontSize: 22, fontWeight: 800, lineHeight: 1.25 },
  answerGroup: { fontSize: 13, color: "#555", lineHeight: 1.4 },
  guessBadge: { padding: "4px 10px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
  actionZone: { minHeight: 0 },
  gradeBtns: { display: "flex", flexDirection: "column", gap: 8, width: "100%" },
  actionSpacer: { minHeight: 0 },
  btn: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontSize: 17 },
  btnRemembered: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #1a7f37", background: "#effcf3", fontSize: 17, fontWeight: 700 },
  btnHazy: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #b26a00", background: "#fff6e8", fontSize: 17, fontWeight: 700 },
  btnForgot: { width: "100%", padding: "12px 12px", borderRadius: 12, border: "1px solid #cf222e", background: "#fff0f0", fontSize: 17, fontWeight: 700 },
  doneWrap: { display: "flex", flexDirection: "column", gap: 12, width: "100%", margin: "auto 0" },
  doneTitle: { fontSize: 24, fontWeight: 800, textAlign: "center" },
  doneSub: { fontSize: 14, color: "#555", textAlign: "center" },
  resultGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  resultCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafbfc" },
  resultLabel: { fontSize: 13, color: "#666" },
  resultValue: { fontSize: 24, fontWeight: 800, marginTop: 6 },
  doneBtns: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
};
