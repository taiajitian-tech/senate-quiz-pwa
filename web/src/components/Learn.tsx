import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, getForgettingScore, isMastered, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadFreshCycle, saveFreshCycle, loadProgress, saveProgress, type FreshCycleState } from "./learnStorage";
import { bumpStats } from "./stats";
import { loadMasteredIds, loadWrongIds, saveMasteredIds, saveWrongIds } from "./progress";
import { formatLearningHeading, getLearningAnswerLines, getTargetLabels, loadPersonsForTarget, shouldShowLearningHeadingKana, type AppMode, type Person, type Target } from "./data";
import SafeImage from "./SafeImage";
import { loadOptions } from "./optionsStore";

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

type UpdatesPayload = {
  items?: Array<{ target?: string; name?: string; type?: string }>;
};

function normalizePersonName(value: string): string {
  return value.replace(/[\s\u3000]+/g, "").trim();
}


type PartySummary = {
  name: string;
  count: number;
};

type LearnFilterMode = "all" | "party";

const DAY = 24 * 60 * 60 * 1000;

function shuffleIds(ids: number[]) {
  const next = [...ids];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function getPartyName(person: Person) {
  const party = (person.party ?? person.group ?? "").trim();
  return party || "無所属";
}

function buildPartySummaries(items: Person[]): PartySummary[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const party = getPartyName(item);
    counts.set(party, (counts.get(party) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name, "ja"));
}

function hasAnyProgressForItems(progress: Record<number, ProgressItem>, items: Person[]) {
  return items.some((item) => Boolean(progress[item.id]));
}

function sanitizeFreshCycle(state: FreshCycleState | null, items: Person[]) {
  if (!state) return null;
  const validIds = new Set(items.map((item) => item.id));
  const order = state.order.filter((id) => validIds.has(id));
  if (order.length === 0) return null;
  const cursor = Math.min(Math.max(0, state.cursor), order.length);
  return { order, cursor } satisfies FreshCycleState;
}

function getFreshCycleNextId(state: FreshCycleState | null, askedIds: Set<number>) {
  if (!state) return null;
  for (let index = state.cursor; index < state.order.length; index += 1) {
    const id = state.order[index];
    if (!askedIds.has(id)) return id;
  }
  return null;
}

function sortByRisk(items: Person[], progress: Record<number, ProgressItem>, now: number) {
  return [...items].sort((a, b) => {
    const score = getForgettingScore(progress[b.id], now) - getForgettingScore(progress[a.id], now);
    if (score !== 0) return score;
    return a.id - b.id;
  });
}

function pickNext(
  items: Person[],
  progress: Record<number, ProgressItem>,
  now: number,
  mode: Mode,
  askedIds: Set<number>,
  recentAddedNames: Set<string>,
  forcedId?: number | null
) {
  if (items.length === 0) return null;

  if (forcedId != null) {
    const forced = items.find((item) => item.id === forcedId);
    if (forced && !askedIds.has(forced.id)) return forced;
  }

  const fresh: Person[] = [];
  const leech: Person[] = [];
  const due: Person[] = [];
  const upcoming: Person[] = [];
  const recentAdded: Person[] = [];
  const masteredPool: Person[] = [];

  for (const item of items) {
    if (askedIds.has(item.id)) continue;

    const normalizedName = normalizePersonName(item.name);
    const isRecentlyAdded = recentAddedNames.has(normalizedName);
    const state = progress[item.id];

    if (!state) {
      if (mode !== "review") {
        if (isRecentlyAdded) recentAdded.push(item);
        else fresh.push(item);
      }
      continue;
    }

    if (isMastered(state, now)) {
      masteredPool.push(item);
      continue;
    }

    if (state.status === "leech") {
      if (isRecentlyAdded) recentAdded.push(item);
      leech.push(item);
      continue;
    }

    if (state.due <= now) {
      if (isRecentlyAdded) recentAdded.push(item);
      due.push(item);
      continue;
    }

    const dueSoon = state.due - now <= DAY * Math.min(Math.max(state.stability, 1), 7);
    const forgettingSoon = getForgettingScore(state, now) >= 0.55;
    if (dueSoon || forgettingSoon) {
      if (isRecentlyAdded) recentAdded.push(item);
      upcoming.push(item);
      continue;
    }

    if (isRecentlyAdded && mode !== "review") {
      recentAdded.push(item);
    }
  }

  const riskDue = sortByRisk(due, progress, now);
  const riskUpcoming = sortByRisk(upcoming, progress, now);
  const riskLeech = sortByRisk(leech, progress, now);
  const recentAddedSorted = sortByRisk(recentAdded, progress, now);

  if (mode === "review") {
    return riskLeech[0] ?? riskDue[0] ?? riskUpcoming[0] ?? null;
  }

  const askedCount = askedIds.size;
  const cycle = askedCount % 20;

  if (recentAddedSorted.length > 0 && (askedCount < 6 || cycle === 0 || cycle === 7 || cycle === 14)) {
    return recentAddedSorted[0];
  }

  if (riskLeech.length > 0 && (cycle === 2 || cycle === 9 || cycle === 15)) return riskLeech[0];
  if (riskDue.length > 0 && cycle < 11) return riskDue[0];
  if (riskUpcoming.length > 0 && cycle < 16) return riskUpcoming[0];
  if (recentAddedSorted.length > 0) return recentAddedSorted[0];
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  if (masteredPool.length > 0 && Math.random() < 0.05) {
    return masteredPool[Math.floor(Math.random() * masteredPool.length)];
  }
  return riskLeech[0] ?? riskDue[0] ?? riskUpcoming[0] ?? null;
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
  const options = useMemo(() => loadOptions(), []);
  const sessionSize = options.quizCount;
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Person[]>([]);
  const [recentAddedNames, setRecentAddedNames] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress(props.appMode, props.target));
  const [freshCycle, setFreshCycle] = useState<FreshCycleState | null>(() => loadFreshCycle(props.appMode, props.target));
  const [askedIds, setAskedIds] = useState<number[]>([]);
  const [sessionResult, setSessionResult] = useState<SessionResult>({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
  const [sessionWrongIds, setSessionWrongIds] = useState<number[]>([]);
  const [sessionDone, setSessionDone] = useState(false);
  const [filterMode, setFilterMode] = useState<LearnFilterMode>("all");
  const [selectedParties, setSelectedParties] = useState<string[]>([]);
  const [hasStarted, setHasStarted] = useState(props.mode === "review");

  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    const loaded = loadProgress(props.appMode, props.target);
    setProgress(loaded);
    setFreshCycle(loadFreshCycle(props.appMode, props.target));
    setAskedIds([]);
    setSessionResult({ total: 0, remembered: 0, hazy: 0, notRemembered: 0 });
    setSessionWrongIds([]);
    setSessionDone(false);
    setRevealed(false);
    setFilterMode("all");
    setSelectedParties([]);
    setHasStarted(props.mode === "review");
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

  const supportsPartySelection = props.target === "senators" || props.target === "representatives";
  const partySummaries = useMemo(() => (supportsPartySelection ? buildPartySummaries(items) : []), [items, supportsPartySelection]);
  const selectedPartySet = useMemo(() => new Set(selectedParties), [selectedParties]);
  const usePartyFilter = supportsPartySelection && filterMode === "party" && selectedParties.length > 0;
  const activeItems = useMemo(() => {
    if (!usePartyFilter) return items;
    return items.filter((item) => selectedPartySet.has(getPartyName(item)));
  }, [items, selectedPartySet, usePartyFilter]);

  useEffect(() => {
    if (!useFreshCycle) {
      return;
    }
    if (activeItems.length === 0) return;

    const sanitized = sanitizeFreshCycle(freshCycle, activeItems);
    if (sanitized && (sanitized.cursor !== freshCycle?.cursor || sanitized.order.length !== freshCycle?.order.length)) {
      setFreshCycle(sanitized);
      saveFreshCycle(props.appMode, props.target, sanitized);
      return;
    }
    if (sanitized) return;
    if (hasAnyProgressForItems(progress, activeItems)) return;

    const created: FreshCycleState = {
      order: shuffleIds(activeItems.map((item) => item.id)),
      cursor: 0,
    };
    setFreshCycle(created);
    saveFreshCycle(props.appMode, props.target, created);
  }, [freshCycle, activeItems, progress, props.appMode, props.target, useFreshCycle]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`${baseUrl}data/updates.json`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load updates: ${response.status}`);
        const payload = (await response.json()) as UpdatesPayload;
        if (cancelled) return;

        const names = new Set(
          Array.isArray(payload.items)
            ? payload.items
                .filter((item) => item?.type === "added" && item?.target === props.target && typeof item?.name === "string")
                .map((item) => normalizePersonName(item.name as string))
                .filter(Boolean)
            : []
        );

        setRecentAddedNames(names);
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) setRecentAddedNames(new Set());
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, props.target]);

  const askedIdSet = useMemo(() => new Set(askedIds), [askedIds]);
  const focusSummary = useMemo(() => getFocusSummary(progress, activeItems, Date.now()), [progress, activeItems]);
  const useFreshCycle = props.mode !== "review" && !usePartyFilter;
  const activeFreshCycle = useMemo(() => (useFreshCycle ? sanitizeFreshCycle(freshCycle, activeItems) : null), [freshCycle, activeItems, useFreshCycle]);
  const forcedFreshCycleId = useMemo(() => {
    if (!useFreshCycle) return null;
    return getFreshCycleNextId(activeFreshCycle, askedIdSet);
  }, [activeFreshCycle, askedIdSet, useFreshCycle]);
  const current = useMemo(() => {
    if (!hasStarted || sessionDone || askedIds.length >= sessionSize) return null;
    return pickNext(activeItems, progress, Date.now(), props.mode, askedIdSet, recentAddedNames, forcedFreshCycleId);
  }, [activeItems, progress, props.mode, askedIdSet, askedIds.length, sessionDone, recentAddedNames, forcedFreshCycleId, hasStarted, sessionSize]);

  useEffect(() => {
    if (loading || !hasStarted) return;
    if (!sessionDone && (askedIds.length >= sessionSize || (askedIds.length > 0 && !current))) {
      setSessionDone(true);
      setRevealed(false);
    }
  }, [askedIds.length, current, loading, sessionDone, hasStarted, sessionSize]);

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

    if (activeFreshCycle && forcedFreshCycleId === current.id) {
      const nextFreshCycle = {
        order: activeFreshCycle.order,
        cursor: Math.min(activeFreshCycle.cursor + 1, activeFreshCycle.order.length),
      } satisfies FreshCycleState;
      setFreshCycle(nextFreshCycle);
      saveFreshCycle(props.appMode, props.target, nextFreshCycle);
    }

    setAskedIds((prevAsked) => [...prevAsked, current.id]);
    if (grade === "hard" || grade === "again") {
      setSessionWrongIds((prevWrongIds) => (prevWrongIds.includes(current.id) ? prevWrongIds : [...prevWrongIds, current.id]));
    }

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
    setSessionWrongIds([]);
    setSessionDone(false);
    setRevealed(false);
  };

  const toggleParty = (partyName: string) => {
    setSelectedParties((prev) => (prev.includes(partyName) ? prev.filter((name) => name !== partyName) : [...prev, partyName]));
  };

  const startSession = () => {
    if (filterMode === "party" && selectedParties.length === 0) return;
    resetSession();
    setHasStarted(true);
  };

  const reopenSelection = () => {
    resetSession();
    setHasStarted(false);
  };

  const titleMap: Record<Mode, string> = {
    learn: "学習（顔→名前）",
    review: "復習（忘れそう・苦手優先）",
    reverse: "逆学習（名前→顔）",
  };

  const modeHelp: Record<Mode, string> = {
    learn: "新規追加の議員を優先しつつ、忘れそうな議員と苦手な議員も先に出します。完全習得に入った議員は通常出題から外れます。",
    review: "忘却しそうな議員と苦手な議員だけを集中的に出します。短時間で効率よく定着を維持するモードです。",
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


  const renderAnswerHeading = (person: Person) => (
    <div style={styles.answerNameLine}>
      <span style={styles.answerName}>{formatLearningHeading(person, props.target, props.appMode, items)}</span>
      {person.kana && shouldShowLearningHeadingKana(person, props.target, props.appMode, items) ? <span style={styles.answerKana}>{person.kana}</span> : null}
    </div>
  );

  const renderAnswerSubline = (person: Person) => {
    const lines = getLearningAnswerLines(person, props.target, props.appMode);
    return <div style={styles.answerGroup}>{lines.map((line) => <div key={line}>{line}</div>)}</div>;
  };

  const sessionWrongPersons = sessionWrongIds
    .map((id) => activeItems.find((item) => item.id === id) ?? items.find((item) => item.id === id))
    .filter((person): person is Person => person !== undefined);

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
            <div style={styles.progressBox}>{Math.min(askedIds.length, sessionSize)} / {sessionSize}</div>
          </div>
          {!compactLayout ? <div style={styles.modeDesc}>{modeHelp[props.mode]}</div> : null}
          <div style={styles.focusHint}>{compactLayout ? summaryTextCompact : summaryText}</div>
          {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
        </div>

        {!hasStarted && props.mode !== "review" ? (
          <div style={styles.card}>
            <div style={styles.setupWrap}>
              <div style={styles.setupTitle}>出題前の設定</div>
              <div style={styles.setupSection}>
                <div style={styles.setupLabel}>出題範囲</div>
                <div style={styles.setupModeBtns}>
                  <button
                    type="button"
                    style={filterMode === "all" ? styles.setupModeBtnActive : styles.setupModeBtn}
                    onClick={() => setFilterMode("all")}
                  >
                    すべてで出題
                  </button>
                  {supportsPartySelection ? (
                    <button
                      type="button"
                      style={filterMode === "party" ? styles.setupModeBtnActive : styles.setupModeBtn}
                      onClick={() => setFilterMode("party")}
                    >
                      政党を選んで出題
                    </button>
                  ) : null}
                </div>
              </div>

              {supportsPartySelection && filterMode === "party" ? (
                <div style={styles.setupSection}>
                  <div style={styles.setupLabel}>政党を複数選択</div>
                  <div style={styles.setupNote}>少数政党も混ぜられるように、複数選択できます。</div>
                  <div style={styles.partySelectionList}>
                    {partySummaries.map((party) => {
                      const selected = selectedPartySet.has(party.name);
                      return (
                        <button
                          key={party.name}
                          type="button"
                          style={selected ? styles.partySelectBtnActive : styles.partySelectBtn}
                          onClick={() => toggleParty(party.name)}
                        >
                          {party.name} ({party.count})
                        </button>
                      );
                    })}
                  </div>
                  <div style={styles.setupSelected}>
                    {selectedParties.length > 0 ? `選択中 ${selectedParties.length}政党 / 対象 ${activeItems.length}人` : "政党を1つ以上選んでください"}
                  </div>
                </div>
              ) : (
                <div style={styles.setupSelected}>対象 {activeItems.length}人</div>
              )}

              <div style={styles.setupNote}>問題数はオプションの {sessionSize} 問が使われます。</div>
              <div style={styles.doneBtns}>
                <button
                  type="button"
                  style={filterMode === "party" && selectedParties.length === 0 ? styles.primaryBtnDisabled : styles.primaryBtn}
                  onClick={startSession}
                  disabled={filterMode === "party" && selectedParties.length === 0}
                >
                  この条件で開始
                </button>
                <button type="button" style={styles.btn} onClick={props.onBackTitle}>タイトルへ戻る</button>
              </div>
            </div>
          </div>
        ) : (
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
              {sessionWrongPersons.length > 0 ? (
                <div style={styles.wrongSection}>
                  <div style={styles.wrongSectionTitle}>今回間違えた議員</div>
                  <div style={styles.wrongList}>
                    {sessionWrongPersons.map((person) => (
                      <div key={person.id} style={styles.wrongCard}>
                        <div style={styles.wrongImageWrap}>
                          <SafeImage
                            src={person.images?.[0] ?? ""}
                            alt={person.name}
                            style={styles.wrongImage}
                            fallbackStyle={styles.wrongImageFallback}
                            fallbackText="画像なし"
                          />
                        </div>
                        <div style={styles.wrongInfo}>
                          {renderAnswerHeading(person)}
                          {renderAnswerSubline(person)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              <div style={styles.doneBtns}>
                <button type="button" style={styles.primaryBtn} onClick={resetSession}>次の出題へ</button>
                {props.mode !== "review" ? <button type="button" style={styles.btn} onClick={reopenSelection}>出題条件を選び直す</button> : null}
                <button type="button" style={styles.btn} onClick={props.onBackTitle}>終了してタイトルへ戻る</button>
              </div>
            </div>
          ) : !current ? (
            <div style={styles.center}>{props.mode === "review" ? "今は忘れそうな議員・苦手な議員がありません。" : "出題できるデータがありません。"}</div>
          ) : props.mode === "reverse" ? (
            <div style={compactLayout ? styles.quizLayoutCompact : styles.quizLayout}>
              <div style={styles.infoZone}>
                {renderAnswerHeading(current)}
                {renderAnswerSubline(current)}
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
                    {renderAnswerHeading(current)}
                    {renderAnswerSubline(current)}
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
        )}
      </div>

      <HelpModal open={helpOpen} title="このモードの使い方" onClose={() => setHelpOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div><b>このモードの役割</b></div>
          <div>{modeHelp[props.mode]}</div>
          <div><b>判定の基準</b></div>
          <div>覚えていた：見ずにすぐ出た</div>
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
  answerNameLine: { display: "flex", flexWrap: "wrap", alignItems: "baseline", gap: 6 },
  answerName: { fontSize: "clamp(22px, 6.3vw, 28px)", fontWeight: 800, lineHeight: 1.2, wordBreak: "keep-all", overflowWrap: "anywhere" },
  answerKana: { fontSize: "clamp(13px, 3.6vw, 16px)", fontWeight: 700, lineHeight: 1.2, color: "#374151" },
  answerGroup: { fontSize: 13, color: "#555", lineHeight: 1.5, display: "grid", gap: 2 },
  guessBadge: { alignSelf: "flex-start", padding: "3px 7px", borderRadius: 999, background: "#fff3cd", color: "#7a5d00", fontSize: 11, fontWeight: 700 },
  actionZone: { display: "flex", flexDirection: "column", justifyContent: "flex-end" },
  actionSpacer: { minHeight: 48 },
  gradeBtns: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 },
  gradeBtnsCompact: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  primaryBtn: { padding: "10px 10px", borderRadius: 12, border: "1px solid #0d6efd", background: "#0d6efd", color: "#fff", fontWeight: 800, fontSize: 14 },
  btn: { padding: "10px 10px", borderRadius: 12, border: "1px solid #999", background: "#fff", fontWeight: 700, fontSize: 13 },
  btnRemembered: { width: "100%", minHeight: 60, padding: "16px 12px", borderRadius: 14, border: "1px solid #1f7a1f", background: "#e9f8ec", color: "#165c16", fontWeight: 800, fontSize: 16 },
  btnHazy: { width: "100%", minHeight: 60, padding: "16px 12px", borderRadius: 14, border: "1px solid #8a6d1d", background: "#fff7e0", color: "#7a5d00", fontWeight: 800, fontSize: 16 },
  btnForgot: { width: "100%", minHeight: 60, padding: "16px 12px", borderRadius: 14, border: "1px solid #b42318", background: "#fff1f1", color: "#a61b14", fontWeight: 800, fontSize: 16 },
  doneWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 10, justifyContent: "center", overflowY: "auto", paddingRight: 2 },
  doneTitle: { fontSize: 20, fontWeight: 800, textAlign: "center" },
  doneSub: { fontSize: 13, color: "#555", textAlign: "center", lineHeight: 1.5 },
  doneMeta: { display: "grid", gap: 5, padding: 10, borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb", fontSize: 12, color: "#444" },
  wrongSection: { display: "grid", gap: 8 },
  wrongSectionTitle: { fontSize: 16, fontWeight: 800, color: "#1f2937" },
  wrongList: { display: "grid", gap: 8 },
  wrongCard: { display: "grid", gridTemplateColumns: "84px minmax(0, 1fr)", gap: 10, alignItems: "center", border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fff" },
  wrongImageWrap: { width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center" },
  wrongImage: { width: 84, height: 84, objectFit: "cover", borderRadius: 10, background: "#f3f3f3" },
  wrongImageFallback: { width: 84, height: 84, display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 10, fontSize: 12 },
  wrongInfo: { minWidth: 0, display: "grid", gap: 4 },
  resultGrid: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  resultCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 10, background: "#fafbfc" },
  resultLabel: { fontSize: 12, color: "#666", marginBottom: 4 },
  resultValue: { fontSize: 22, fontWeight: 800 },
  doneBtns: { display: "grid", gap: 8 },
  setupWrap: { width: "100%", display: "grid", gap: 12, alignContent: "center" },
  setupTitle: { fontSize: 20, fontWeight: 800, textAlign: "center", color: "#111827" },
  setupSection: { display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#f8fafc", border: "1px solid #e5e7eb" },
  setupLabel: { fontSize: 14, fontWeight: 800, color: "#111827" },
  setupNote: { fontSize: 12, lineHeight: 1.5, color: "#4b5563" },
  setupSelected: { fontSize: 13, fontWeight: 700, color: "#1f2937" },
  setupModeBtns: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 8 },
  setupModeBtn: { padding: "12px 10px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#fff", color: "#1f2937", fontWeight: 700, fontSize: 14 },
  setupModeBtnActive: { padding: "12px 10px", borderRadius: 12, border: "1px solid #1d4ed8", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800, fontSize: 14 },
  partySelectionList: { display: "flex", flexWrap: "wrap", gap: 8 },
  partySelectBtn: { padding: "10px 12px", borderRadius: 999, border: "1px solid #cbd5e1", background: "#fff", color: "#1f2937", fontWeight: 700, fontSize: 13 },
  partySelectBtnActive: { padding: "10px 12px", borderRadius: 999, border: "1px solid #1d4ed8", background: "#1d4ed8", color: "#fff", fontWeight: 800, fontSize: 13 },
  primaryBtnDisabled: { padding: "10px 10px", borderRadius: 12, border: "1px solid #cbd5e1", background: "#e5e7eb", color: "#6b7280", fontWeight: 800, fontSize: 14, cursor: "not-allowed" },
};
