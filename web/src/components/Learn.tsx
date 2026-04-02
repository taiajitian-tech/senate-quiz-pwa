import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, getForgettingScore, isMastered, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadProgress, saveProgress } from "./learnStorage";
import { bumpStats } from "./stats";
import { loadMasteredIds, loadWrongIds, saveMasteredIds, saveWrongIds } from "./progress";
import { formatNameWithKana, getTargetLabels, loadPersonsForTarget, type AppMode, type Person, type Target } from "./data";
import SafeImage from "./SafeImage";

type Mode = "learn" | "review" | "reverse";

type Props = {
  appMode: AppMode;
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
const DAY = 24 * 60 * 60 * 1000;

function sortByRisk(items: Person[], progress: Record<number, ProgressItem>, now: number) {
  return [...items].sort((a, b) => {
    const score = getForgettingScore(progress[b.id], now) - getForgettingScore(progress[a.id], now);
    if (score !== 0) return score;
    return a.id - b.id;
  });
}

type RetryEntry = {
  availableAt: number;
  priority: number;
};

function pickNext(
  items: Person[],
  progress: Record<number, ProgressItem>,
  now: number,
  mode: Mode,
  completedIds: Set<number>,
  retryMap: Record<number, RetryEntry>,
  sessionStep: number,
  lastAskedId: number | null
) {
  if (items.length === 0) return null;

  const retryAgain: Person[] = [];
  const retryHard: Person[] = [];
  const fresh: Person[] = [];
  const leech: Person[] = [];
  const due: Person[] = [];
  const upcoming: Person[] = [];

  for (const item of items) {
    if (completedIds.has(item.id)) continue;

    const retry = retryMap[item.id];
    if (retry) {
      if (retry.availableAt > sessionStep) continue;
      if (item.id === lastAskedId) continue;
      if (retry.priority >= 2) retryAgain.push(item);
      else retryHard.push(item);
      continue;
    }

    const state = progress[item.id];
    if (!state) {
      if (mode !== "review") fresh.push(item);
      continue;
    }

    if (isMastered(state, now)) {
      continue;
    }

    if (state.status === "leech") {
      leech.push(item);
      continue;
    }

    if (state.due <= now) {
      due.push(item);
      continue;
    }

    const dueSoon = state.due - now <= DAY * Math.min(Math.max(state.stability, 1), 7);
    const forgettingSoon = getForgettingScore(state, now) >= 0.55;
    if (dueSoon || forgettingSoon) {
      upcoming.push(item);
    }
  }

  const riskDue = sortByRisk(due, progress, now);
  const riskUpcoming = sortByRisk(upcoming, progress, now);
  const riskLeech = sortByRisk(leech, progress, now);

  const riskRetryAgain = sortByRisk(retryAgain, progress, now);
  const riskRetryHard = sortByRisk(retryHard, progress, now);

  if (mode === "review") {
    return riskRetryAgain[0] ?? riskLeech[0] ?? riskDue[0] ?? riskRetryHard[0] ?? riskUpcoming[0] ?? null;
  }

  const cycle = sessionStep % 20;

  if (riskRetryAgain.length > 0) return riskRetryAgain[0];
  if (riskLeech.length > 0 && (cycle === 2 || cycle === 9 || cycle === 15)) return riskLeech[0];
  if (riskDue.length > 0 && cycle < 11) return riskDue[0];
  if (riskRetryHard.length > 0 && cycle < 14) return riskRetryHard[0];
  if (riskUpcoming.length > 0 && cycle < 16) return riskUpcoming[0];
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  return riskRetryHard[0] ?? riskLeech[0] ?? riskDue[0] ?? riskUpcoming[0] ?? null;
}

function getFocusSummary(progress: Record<number, ProgressItem>, items: Person[], now: number) {
  const validIds = new Set(items.map((item) => item.id));
  let due = 0;
  let leech = 0;
  let mastered = 0;

  for (const value of Object.values(progress)) {
    if (!validIds.has(value.id)) continue;
    if (isMastered(value, now)) {
      mastered += 1;
      continue;
    }
    if (value.status === "leech") leech += 1;
    if (value.due <= now || getForgettingScore(value, now) >= 0.55) due += 1;
  }

  return { due, leech, mastered };
}

export default function Learn(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Person[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress(props.appMode, props.target));
  const [askedIds, setAskedIds] = useState<number[]>([]);
  const [completedIds, setCompletedIds] = useState<number[]>([]);
  const [retryMap, setRetryMap] = useState<Record<number, RetryEntry>>({});
  const [sessionResult, setSessionResult] = useState<SessionResult>({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
  const [sessionDone, setSessionDone] = useState(false);

  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    const loaded = loadProgress(props.appMode, props.target);
    setProgress(loaded);
    setAskedIds([]);
    setCompletedIds([]);
    setRetryMap({});
    setSessionResult({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
    setSessionDone(false);
    setRevealed(false);
  }, [props.appMode, props.target, props.mode]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        setItems(await loadPersonsForTarget(baseUrl, props.target, props.appMode));
      } catch (e) {
        console.error(e);
        setItems([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [baseUrl, props.appMode, props.target]);

  const completedIdSet = useMemo(() => new Set(completedIds), [completedIds]);
  const focusSummary = useMemo(() => getFocusSummary(progress, items, Date.now()), [progress, items]);
  const current = useMemo(() => {
    if (sessionDone || askedIds.length >= SESSION_SIZE) return null;
    return pickNext(items, progress, Date.now(), props.mode, completedIdSet, retryMap, askedIds.length, askedIds.at(-1) ?? null);
  }, [items, progress, props.mode, completedIdSet, retryMap, askedIds, sessionDone]);

  useEffect(() => {
    if (loading) return;
    if (!sessionDone && (askedIds.length >= SESSION_SIZE || (askedIds.length > 0 && !current))) {
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
    saveProgress(props.appMode, props.target, nextMap);
    appendHistory(props.appMode, props.target, { at: now, id: current.id, grade });

    bumpStats(props.appMode, props.target, {
      playedTotal: 1,
      correctTotal: grade === "again" ? 0 : 1,
      wrongTotal: grade === "again" ? 1 : 0,
      masteredCount: next.status === "mastered" && (!prev || prev.status !== "mastered") ? 1 : 0,
      leechCount: next.status === "leech" && (!prev || prev.status !== "leech") ? 1 : 0,
    });

    const wrong = new Set(loadWrongIds(props.appMode, props.target));
    const mastered = new Set(loadMasteredIds(props.appMode, props.target));

    if (next.status === "mastered") mastered.add(current.id);
    else mastered.delete(current.id);

    if (grade === "again" || next.status === "leech") wrong.add(current.id);
    else if (grade === "good" && next.consecutiveCorrect >= 2) wrong.delete(current.id);

    saveWrongIds(props.appMode, props.target, [...wrong]);
    saveMasteredIds(props.appMode, props.target, [...mastered]);

    const nextStep = askedIds.length + 1;
    setAskedIds((prevAsked) => [...prevAsked, current.id]);
    setCompletedIds((prevCompleted) => {
      if (grade === "good") {
        if (prevCompleted.includes(current.id)) return prevCompleted;
        return [...prevCompleted, current.id];
      }
      return prevCompleted.filter((id) => id !== current.id);
    });
    setRetryMap((prevRetryMap) => {
      const nextRetryMap = { ...prevRetryMap };
      if (grade === "again") {
        nextRetryMap[current.id] = { availableAt: nextStep + 3, priority: 2 };
      } else if (grade === "hard") {
        nextRetryMap[current.id] = { availableAt: nextStep + 8, priority: 1 };
      } else {
        delete nextRetryMap[current.id];
      }
      return nextRetryMap;
    });
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
    setCompletedIds([]);
    setRetryMap({});
    setSessionResult({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
    setSessionDone(false);
    setRevealed(false);
  };

  const titleMap: Record<Mode, string> = {
    learn: "学習（顔→名前）",
    review: "復習（忘れそう・苦手優先）",
    reverse: "逆学習（名前→顔）",
  };

  const modeHelp: Record<Mode, string> = {
    learn: "新規よりも、忘れそうな議員と苦手な議員を優先します。完全習得に入った議員は通常出題から外れます。",
    review: "忘却しそうな議員と苦手な議員だけを集中的に出します。短時間で効率よく定着を維持するモードです。",
    reverse: "名前から顔を引く練習です。通常学習と同じ記憶状態を使い、忘れそうな議員と苦手な議員を優先します。",
  };

  const summaryText =
    props.mode === "review"
      ? `忘れそう ${focusSummary.due}人 / 苦手 ${focusSummary.leech}人 / 完全習得 ${focusSummary.mastered}人`
      : `要復習 ${focusSummary.due}人 / 苦手 ${focusSummary.leech}人 / 完全習得 ${focusSummary.mastered}人`;

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
            <div style={styles.sub}>{getTargetLabels(props.appMode)[props.target]}</div>
            <div style={styles.progressBox}>{Math.min(askedIds.length, SESSION_SIZE)} / {SESSION_SIZE}</div>
          </div>
          <div style={styles.modeDesc}>{modeHelp[props.mode]}</div>
          <div style={styles.focusHint}>{summaryText}</div>
          {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
        </div>

        <div style={styles.card}>
          {loading ? <div style={styles.center}>読み込み中</div> : sessionDone ? (
            <div style={styles.doneWrap}>
              <div style={styles.doneTitle}>今回の出題は終了です</div>
              <div style={styles.doneSub}>次は、忘れそうな議員と苦手な議員を優先して再構成されます。</div>
              <div style={styles.resultGrid}>
                <div style={styles.resultCard}><div style={styles.resultLabel}>出題数</div><div style={styles.resultValue}>{sessionResult.total}</div></div>
                <div style={styles.resultCard}><div style={styles.resultLabel}>覚えていた</div><div style={styles.resultValue}>{sessionResult.remembered}</div></div>
                <div style={styles.resultCard}><div style={styles.resultLabel}>うろ覚え</div><div style={styles.resultValue}>{sessionResult.hazy}</div></div>
                <div style={styles.resultCard}><div style={styles.resultLabel}>覚えていない</div><div style={styles.resultValue}>{sessionResult.notRemembered}</div></div>
              </div>
              <div style={styles.doneMeta}>
                <div>次の復習候補：{focusSummary.due}人</div>
                <div>苦手として追跡中：{focusSummary.leech}人</div>
                <div>通常出題から外れた完全習得：{focusSummary.mastered}人</div>
              </div>
              <div style={styles.doneBtns}>
                <button type="button" style={styles.primaryBtn} onClick={resetSession}>次の出題へ</button>
                <button type="button" style={styles.btn} onClick={props.onBackTitle}>終了してタイトルへ戻る</button>
              </div>
            </div>
          ) : !current ? (
            <div style={styles.center}>{props.mode === "review" ? "今は忘れそうな議員・苦手な議員がありません。" : "出題できるデータがありません。"}</div>
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
          <div><b>今回の改善点</b></div>
          <div>忘れそうな議員を先に出し、苦手として落ち続ける議員は自動で優先度を上げます。</div>
          <div>完全習得に入った議員は通常出題から外れ、苦手と復習対象を先に回す構成です。</div>
          <div><b>記憶の定着</b></div>
          <div>答えを見た後に自己判定し、忘れかけのものを適切な時期に出し直すことで定着を伸ばします。</div>
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
  focusHint: { fontSize: 12, color: "#0f4c81", lineHeight: 1.5, background: "#eef6ff", border: "1px solid #c8ddff", borderRadius: 10, padding: "6px 8px" },
  progressBox: { padding: "4px 10px", borderRadius: 999, background: "#eef6ff", border: "1px solid #c8ddff", fontSize: 12, color: "#0958b3", fontWeight: 700, whiteSpace: "nowrap" },
  card: { flex: 1, minHeight: 0, border: "1px solid #ddd", borderRadius: 14, padding: 10, background: "#fff", display: "flex", overflow: "hidden" },
  center: { margin: "auto", color: "#666", fontSize: 14, textAlign: "center" },
  quizLayout: { display: "grid", gridTemplateRows: "minmax(0, 45vh) auto auto", gap: 10, width: "100%", minHeight: 0 },
  imageZone: { minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  imgBox: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%", maxHeight: "45vh", objectFit: "contain", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "100%", height: "100%", maxHeight: "45vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  placeholderBox: { width: "100%", height: "100%", maxHeight: "45vh", borderRadius: 12, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontWeight: 700 },
  infoZone: { display: "flex", flexDirection: "column", gap: 8, minHeight: 0 },
  promptBox: { display: "flex", flexDirection: "column", gap: 10 },
  msg: { fontSize: 14, lineHeight: 1.6, color: "#333" },
  answerName: { fontSize: 28, fontWeight: 800, lineHeight: 1.25, wordBreak: "keep-all", overflowWrap: "anywhere" },
  answerGroup: { fontSize: 14, color: "#555", lineHeight: 1.5 },
  guessBadge: { alignSelf: "flex-start", padding: "4px 8px", borderRadius: 999, background: "#fff3cd", color: "#7a5d00", fontSize: 12, fontWeight: 700 },
  actionZone: { display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  actionSpacer: { minHeight: 54 },
  gradeBtns: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  primaryBtn: { padding: "12px 12px", borderRadius: 12, border: "1px solid #0d6efd", background: "#0d6efd", color: "#fff", fontWeight: 800, fontSize: 15 },
  btn: { padding: "12px 12px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontWeight: 700, fontSize: 14 },
  btnRemembered: { padding: "12px 10px", borderRadius: 12, border: "1px solid #1f7a1f", background: "#e9f8ec", color: "#165c16", fontWeight: 800, fontSize: 14 },
  btnHazy: { padding: "12px 10px", borderRadius: 12, border: "1px solid #8a6d1d", background: "#fff7e0", color: "#7a5d00", fontWeight: 800, fontSize: 14 },
  btnForgot: { padding: "12px 10px", borderRadius: 12, border: "1px solid #b42318", background: "#fff1f1", color: "#a61b14", fontWeight: 800, fontSize: 14 },
  doneWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" },
  doneTitle: { fontSize: 22, fontWeight: 800, textAlign: "center" },
  doneSub: { fontSize: 14, color: "#555", textAlign: "center" },
  doneMeta: { display: "grid", gap: 6, padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb", fontSize: 13, color: "#444" },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 },
  resultCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, background: "#fafbfc" },
  resultLabel: { fontSize: 13, color: "#666", marginBottom: 6 },
  resultValue: { fontSize: 24, fontWeight: 800 },
  doneBtns: { display: "grid", gap: 8 },
};
