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

type QueueEntry = {
  id: number;
  availableAfter: number;
  priority: number;
};

const SESSION_SIZE = 30;
const DAY = 24 * 60 * 60 * 1000;
const STRONG_RECALL_MS = 2500;
const RECENT_BLOCK_COUNT = 2;

function sortByRisk(items: Person[], progress: Record<number, ProgressItem>, now: number) {
  return [...items].sort((a, b) => {
    const score = getForgettingScore(progress[b.id], now) - getForgettingScore(progress[a.id], now);
    if (score !== 0) return score;
    return a.id - b.id;
  });
}

function preferNonRecent(items: Person[], recentIds: number[]) {
  if (items.length <= 1) return items;
  const recentSet = new Set(recentIds);
  const filtered = items.filter((item) => !recentSet.has(item.id));
  return filtered.length > 0 ? filtered : items;
}

function pickRegularNext(
  items: Person[],
  progress: Record<number, ProgressItem>,
  now: number,
  mode: Mode,
  completedIds: Set<number>,
  recentIds: number[]
) {
  if (items.length === 0) return null;

  const fresh: Person[] = [];
  const leech: Person[] = [];
  const due: Person[] = [];
  const upcoming: Person[] = [];

  for (const item of items) {
    if (completedIds.has(item.id)) continue;

    const state = progress[item.id];
    if (!state) {
      if (mode !== "review") fresh.push(item);
      continue;
    }

    if (isMastered(state, now)) continue;

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
    if (dueSoon || forgettingSoon) upcoming.push(item);
  }

  const riskLeech = preferNonRecent(sortByRisk(leech, progress, now), recentIds);
  const riskDue = preferNonRecent(sortByRisk(due, progress, now), recentIds);
  const riskUpcoming = preferNonRecent(sortByRisk(upcoming, progress, now), recentIds);
  const freshPool = preferNonRecent(fresh, recentIds);

  if (mode === "review") return riskLeech[0] ?? riskDue[0] ?? riskUpcoming[0] ?? null;

  const answeredCount = completedIds.size;
  const cycle = answeredCount % 18;

  if (riskLeech.length > 0 && (cycle === 1 || cycle === 5 || cycle === 10 || cycle === 14)) return riskLeech[0];
  if (riskDue.length > 0 && cycle < 12) return riskDue[0];
  if (riskUpcoming.length > 0 && cycle < 16) return riskUpcoming[0];
  if (freshPool.length > 0) return freshPool[Math.floor(Math.random() * freshPool.length)];
  return riskLeech[0] ?? riskDue[0] ?? riskUpcoming[0] ?? null;
}

function pickQueuedNext(
  queue: QueueEntry[],
  itemsById: Map<number, Person>,
  turn: number,
  recentIds: number[]
) {
  const available = queue
    .filter((entry) => entry.availableAfter <= turn)
    .sort((a, b) => (a.priority - b.priority) || (a.availableAfter - b.availableAfter) || (a.id - b.id));

  if (available.length === 0) return null;

  const recentSet = new Set(recentIds);
  const candidate = available.find((entry) => !recentSet.has(entry.id)) ?? available[0];
  return itemsById.get(candidate.id) ?? null;
}

function upsertQueue(entries: QueueEntry[], nextEntry: QueueEntry) {
  const others = entries.filter((entry) => entry.id !== nextEntry.id);
  return [...others, nextEntry];
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
  const [pendingQueue, setPendingQueue] = useState<QueueEntry[]>([]);
  const [recentIds, setRecentIds] = useState<number[]>([]);
  const [promptStartedAt, setPromptStartedAt] = useState<number>(() => Date.now());
  const [sessionResult, setSessionResult] = useState<SessionResult>({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
  const [sessionDone, setSessionDone] = useState(false);

  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    const loaded = loadProgress(props.appMode, props.target);
    setProgress(loaded);
    setAskedIds([]);
    setPendingQueue([]);
    setRecentIds([]);
    setPromptStartedAt(Date.now());
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

  const completedIdSet = useMemo(() => new Set(askedIds), [askedIds]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const focusSummary = useMemo(() => getFocusSummary(progress, items, Date.now()), [progress, items]);
  const current = useMemo(() => {
    if (sessionDone || askedIds.length >= SESSION_SIZE) return null;
    const turn = askedIds.length;
    const queued = pickQueuedNext(pendingQueue, itemsById, turn, recentIds);
    if (queued) return queued;
    return pickRegularNext(items, progress, Date.now(), props.mode, completedIdSet, recentIds);
  }, [items, itemsById, progress, props.mode, completedIdSet, askedIds.length, pendingQueue, recentIds, sessionDone]);

  useEffect(() => {
    if (!current) return;
    setPromptStartedAt(Date.now());
    setRevealed(false);
  }, [current]);

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
    const elapsed = Math.max(now - promptStartedAt, 0);
    const effectiveGrade: Grade = grade === "good" && elapsed <= STRONG_RECALL_MS ? "strong" : grade;
    const prev = progress[current.id];
    const next = applyGrade(prev, current.id, effectiveGrade, now);
    const nextMap = { ...progress, [current.id]: next };
    setProgress(nextMap);
    saveProgress(props.appMode, props.target, nextMap);
    appendHistory(props.appMode, props.target, { at: now, id: current.id, grade: effectiveGrade });

    bumpStats(props.appMode, props.target, {
      playedTotal: 1,
      correctTotal: effectiveGrade === "again" ? 0 : 1,
      wrongTotal: effectiveGrade === "again" ? 1 : 0,
      masteredCount: next.status === "mastered" && (!prev || prev.status !== "mastered") ? 1 : 0,
      leechCount: next.status === "leech" && (!prev || prev.status !== "leech") ? 1 : 0,
    });

    const wrong = new Set(loadWrongIds(props.appMode, props.target));
    const mastered = new Set(loadMasteredIds(props.appMode, props.target));

    if (next.status === "mastered") mastered.add(current.id);
    else mastered.delete(current.id);

    if (effectiveGrade === "again" || next.status === "leech") wrong.add(current.id);
    else if ((effectiveGrade === "good" || effectiveGrade === "strong") && next.consecutiveCorrect >= 2) wrong.delete(current.id);

    saveWrongIds(props.appMode, props.target, [...wrong]);
    saveMasteredIds(props.appMode, props.target, [...mastered]);

    setPendingQueue((prevQueue) => {
      let queue = prevQueue.filter((entry) => entry.id !== current.id);
      const nextTurn = askedIds.length + 1;
      if (effectiveGrade === "again") {
        queue = upsertQueue(queue, { id: current.id, availableAfter: nextTurn + 2, priority: 0 });
      } else if (effectiveGrade === "hard") {
        queue = upsertQueue(queue, { id: current.id, availableAfter: nextTurn + 5, priority: 1 });
      } else if (next.status === "leech") {
        queue = upsertQueue(queue, { id: current.id, availableAfter: nextTurn + 3, priority: 0 });
      }
      return queue;
    });

    setRecentIds((prevRecent) => [...prevRecent.filter((id) => id !== current.id), current.id].slice(-RECENT_BLOCK_COUNT));
    setAskedIds((prevAsked) => [...prevAsked, current.id]);
    setSessionResult((prevResult) => ({
      total: prevResult.total + 1,
      remembered: prevResult.remembered + (effectiveGrade === "good" || effectiveGrade === "strong" ? 1 : 0),
      hazy: prevResult.hazy + (effectiveGrade === "hard" ? 1 : 0),
      notRemembered: prevResult.notRemembered + (effectiveGrade === "again" ? 1 : 0),
    }));
    setRevealed(false);
  };

  const resetSession = () => {
    setAskedIds([]);
    setPendingQueue([]);
    setRecentIds([]);
    setPromptStartedAt(Date.now());
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
    learn: "忘れそうな議員と苦手な議員を優先します。『覚えていた』をすぐ押せたものは内部で強めに定着扱いになります。",
    review: "忘却しそうな議員と苦手な議員だけを集中的に出します。苦手は数問後に再び出やすくなります。",
    reverse: "名前から顔を引く練習です。通常学習と同じ記憶状態を使い、忘れそうな議員と苦手な議員を優先します。",
  };

  const compactLayout = typeof window !== "undefined" && (window.innerHeight <= 820 || window.innerWidth <= 480);

  const summaryText =
    props.mode === "review"
      ? `忘れそう ${focusSummary.due}人 / 苦手 ${focusSummary.leech}人 / 完全習得 ${focusSummary.mastered}人`
      : `要復習 ${focusSummary.due}人 / 苦手 ${focusSummary.leech}人 / 完全習得 ${focusSummary.mastered}人`;

  const summaryTextCompact = props.mode === "review"
    ? `忘れそう ${focusSummary.due} / 苦手 ${focusSummary.leech} / 完全習得 ${focusSummary.mastered}`
    : `要復習 ${focusSummary.due} / 苦手 ${focusSummary.leech} / 完全習得 ${focusSummary.mastered}`;

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
          {!compactLayout ? <div style={styles.modeDesc}>{modeHelp[props.mode]}</div> : null}
          <div style={styles.focusHint}>{compactLayout ? summaryTextCompact : summaryText}</div>
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
            <div style={compactLayout ? styles.quizLayoutCompact : styles.quizLayout}>
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
                  <div style={compactLayout ? styles.gradeBtnsCompact : styles.gradeBtns}>
                    <button type="button" style={styles.btnRemembered} onClick={() => onGrade("good")}>覚えていた</button>
                    <button type="button" style={styles.btnHazy} onClick={() => onGrade("hard")}>うろ覚え</button>
                    <button type="button" style={styles.btnForgot} onClick={() => onGrade("again")}>覚えていない</button>
                  </div>
                ) : <div style={styles.actionSpacer} />}
              </div>
            </div>
          ) : (
            <div style={compactLayout ? styles.quizLayoutCompact : styles.quizLayout}>
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
                  <div style={compactLayout ? styles.gradeBtnsCompact : styles.gradeBtns}>
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
          <div>覚えていた：見ずに思い出せた。すぐ押せたものは内部で強めに定着扱いになります。</div>
          <div>うろ覚え：少し迷った、部分的に出た</div>
          <div>覚えていない：出ない、別人と混ざる</div>
          <div><b>今回の改善点</b></div>
          <div>忘れそうな議員を先に出し、苦手として落ち続ける議員は数問後に再び出やすくしています。</div>
          <div>完全習得に入った議員は通常出題から外れ、苦手と復習対象を先に回す構成です。</div>
          <div><b>記憶の定着</b></div>
          <div>答えを見た後に自己判定し、忘れかけのものを適切な時期に出し直すことで定着を伸ばします。</div>
        </div>
      </HelpModal>
    </div>
  );
}
const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100dvh", background: "#f7f8fa", padding: 6, overflow: "hidden" },
  shell: { width: "min(720px, 100%)", margin: "0 auto", minHeight: "calc(100dvh - 12px)", display: "flex", flexDirection: "column", gap: 6 },
  header: { display: "flex", flexDirection: "column", gap: 4, background: "#fff", border: "1px solid #ddd", borderRadius: 14, padding: 8, flex: "0 0 auto" },
  topRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  backBtn: { padding: "8px 11px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 12 },
  helpBtn: { padding: "8px 11px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 40, fontSize: 14 },
  h1: { fontSize: "clamp(16px, 4.7vw, 18px)", fontWeight: 800, lineHeight: 1.2 },
  subRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  sub: { fontSize: 11, color: "#555" },
  modeDesc: { fontSize: 11, color: "#444", lineHeight: 1.4 },
  focusHint: { fontSize: 11, color: "#0f4c81", lineHeight: 1.35, background: "#eef6ff", border: "1px solid #c8ddff", borderRadius: 10, padding: "5px 7px" },
  progressBox: { padding: "4px 8px", borderRadius: 999, background: "#eef6ff", border: "1px solid #c8ddff", fontSize: 11, color: "#0958b3", fontWeight: 700, whiteSpace: "nowrap" },
  card: { flex: 1, minHeight: 0, border: "1px solid #ddd", borderRadius: 14, padding: 8, background: "#fff", display: "flex", overflow: "hidden" },
  center: { margin: "auto", color: "#666", fontSize: 14, textAlign: "center" },
  quizLayout: { display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", gap: 8, width: "100%", minHeight: 0 },
  quizLayoutCompact: { display: "grid", gridTemplateRows: "minmax(0, 1fr) auto auto", gap: 6, width: "100%", minHeight: 0 },
  imageZone: { minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" },
  imgBox: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" },
  img: { width: "100%", height: "100%", maxHeight: "min(40dvh, 340px)", objectFit: "contain", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "100%", height: "100%", maxHeight: "min(40dvh, 340px)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  placeholderBox: { width: "100%", height: "100%", maxHeight: "min(40dvh, 340px)", borderRadius: 12, background: "#f3f4f6", display: "flex", alignItems: "center", justifyContent: "center", color: "#666", fontWeight: 700 },
  infoZone: { display: "flex", flexDirection: "column", gap: 6, minHeight: 0 },
  promptBox: { display: "flex", flexDirection: "column", gap: 8 },
  msg: { fontSize: 13, lineHeight: 1.5, color: "#333" },
  answerName: { fontSize: "clamp(22px, 6.3vw, 28px)", fontWeight: 800, lineHeight: 1.2, wordBreak: "keep-all", overflowWrap: "anywhere" },
  answerGroup: { fontSize: 13, color: "#555", lineHeight: 1.4 },
  guessBadge: { alignSelf: "flex-start", padding: "3px 7px", borderRadius: 999, background: "#fff3cd", color: "#7a5d00", fontSize: 11, fontWeight: 700 },
  actionZone: { display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  actionSpacer: { minHeight: 48 },
  gradeBtns: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  gradeBtnsCompact: { display: "grid", gridTemplateColumns: "1fr", gap: 6 },
  primaryBtn: { padding: "10px 10px", borderRadius: 12, border: "1px solid #0d6efd", background: "#0d6efd", color: "#fff", fontWeight: 800, fontSize: 14 },
  btn: { padding: "10px 10px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontWeight: 700, fontSize: 13 },
  btnRemembered: { padding: "10px 8px", borderRadius: 12, border: "1px solid #1f7a1f", background: "#e9f8ec", color: "#165c16", fontWeight: 800, fontSize: 13, width: "100%" },
  btnHazy: { padding: "10px 8px", borderRadius: 12, border: "1px solid #8a6d1d", background: "#fff7e0", color: "#7a5d00", fontWeight: 800, fontSize: 13, width: "100%" },
  btnForgot: { padding: "10px 8px", borderRadius: 12, border: "1px solid #b42318", background: "#fff1f1", color: "#a61b14", fontWeight: 800, fontSize: 13, width: "100%" },
  doneWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center" },
  doneTitle: { fontSize: 20, fontWeight: 800, textAlign: "center" },
  doneSub: { fontSize: 13, color: "#555", textAlign: "center", lineHeight: 1.5 },
  doneMeta: { display: "grid", gap: 5, padding: 10, borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb", fontSize: 12, color: "#444" },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  resultCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fafbfc" },
  resultLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  resultValue: { fontSize: 22, fontWeight: 800 },
  doneBtns: { display: "grid", gap: 8 },
};
