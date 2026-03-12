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

const ACTIVE_NEW_LIMIT = 12;
const DUE_PRIORITY_LIMIT = 16;

function pickRandomPerson(list: Person[], avoidId: number | null) {
  if (list.length === 0) return null;
  if (avoidId == null || list.length === 1) return list[Math.floor(Math.random() * list.length)];

  const filtered = list.filter((item) => item.id !== avoidId);
  const pool = filtered.length > 0 ? filtered : list;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickNext(items: Person[], progress: Record<number, ProgressItem>, now: number, mode: Mode, avoidId: number | null) {
  if (items.length === 0) return null;

  const urgentDue: Array<{ person: Person; due: number; reps: number }> = [];
  const due: Array<{ person: Person; due: number; reps: number }> = [];
  const fresh: Person[] = [];
  let nearest: { person: Person; due: number } | null = null;

  for (const person of items) {
    const item = progress[person.id];
    if (!item) {
      if (mode !== "review") fresh.push(person);
      continue;
    }

    if (item.due <= now) {
      const bucket = item.reps <= 1 || item.lastGrade === "again" ? urgentDue : due;
      bucket.push({ person, due: item.due, reps: item.reps ?? 0 });
      continue;
    }

    if (!nearest || item.due < nearest.due) nearest = { person, due: item.due };
  }

  if (urgentDue.length > 0) {
    urgentDue.sort((a, b) => a.due - b.due || a.reps - b.reps || a.person.id - b.person.id);
    return pickRandomPerson(urgentDue.slice(0, DUE_PRIORITY_LIMIT).map((entry) => entry.person), avoidId);
  }

  if (due.length > 0) {
    due.sort((a, b) => a.due - b.due || a.reps - b.reps || a.person.id - b.person.id);
    return pickRandomPerson(due.slice(0, DUE_PRIORITY_LIMIT).map((entry) => entry.person), avoidId);
  }

  if (mode === "review") return null;

  if (fresh.length > 0) {
    fresh.sort((a, b) => a.id - b.id);
    return pickRandomPerson(fresh.slice(0, ACTIVE_NEW_LIMIT), avoidId);
  }

  return nearest?.person ?? null;
}

export default function Learn(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Person[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress(props.target));
  const [lastCompletedId, setLastCompletedId] = useState<number | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    setProgress(loadProgress(props.target));
    setLastCompletedId(null);
  }, [props.target]);

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

  const current = useMemo(() => pickNext(items, progress, Date.now(), props.mode, lastCompletedId), [items, progress, props.mode, lastCompletedId]);

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
    setLastCompletedId(current.id);
    setRevealed(false);
  };

  const titleMap: Record<Mode, string> = {
    learn: "学習（顔→名前）",
    review: "復習（期限切れのみ）",
    reverse: "逆学習（名前→顔）",
  };

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBackTitle}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>{titleMap[props.mode]}</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={styles.card}>
        {loading ? <div style={styles.center}>読み込み中</div> : !current ? (
          <div style={styles.center}>{props.mode === "review" ? "期限切れの復習がありません。" : "出題できるデータがありません。"}</div>
        ) : (
          <>
            {props.mode === "reverse" ? (
              <div style={styles.block}>
                <div style={styles.answerName}>{current.name}</div>
                <div style={styles.answerGroup}>{current.group ?? ""}</div>
                {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                {!revealed ? (
                  <>
                    <div style={styles.msg}>顔を思い出してから、答えを表示してください。</div>
                    <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </>
                ) : (
                  <>
                    <div style={styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" /></div>
                    <div style={styles.gradeBtns}>
                      <button type="button" style={styles.btn} onClick={() => onGrade("good")}>覚えていた</button>
                      <button type="button" style={styles.btn} onClick={() => onGrade("hard")}>うろ覚え</button>
                      <button type="button" style={styles.btn} onClick={() => onGrade("again")}>覚えていない</button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <>
                <div style={styles.imgBox}><SafeImage src={current.images?.[0] ?? ""} alt={current.name} style={styles.img} fallbackStyle={styles.noImg} fallbackText="画像なし" /></div>
                {!revealed ? (
                  <div style={styles.block}>
                    <div style={styles.msg}>名前を思い出してから、答えを表示してください。</div>
                    <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
                  </div>
                ) : (
                  <div style={styles.block}>
                    <div style={styles.answerName}>{current.name}</div>
                    <div style={styles.answerGroup}>{current.group ?? ""}</div>
                    {current.aiGuess ? <div style={styles.guessBadge}>推定画像</div> : null}
                    <div style={styles.gradeBtns}>
                      <button type="button" style={styles.btn} onClick={() => onGrade("good")}>覚えていた</button>
                      <button type="button" style={styles.btn} onClick={() => onGrade("hard")}>うろ覚え</button>
                      <button type="button" style={styles.btn} onClick={() => onGrade("again")}>覚えていない</button>
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <HelpModal open={helpOpen} title="ヘルプ" onClose={() => setHelpOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div><b>分からないとき</b></div>
          <div>3秒以内に出ない場合は、考え込まずに答えを見て次へ進んでください。</div>
          <div><b>自己判定</b></div>
          <div>覚えていた：3秒以内に出た</div>
          <div>うろ覚え：少し迷った、苗字だけ、答えを見て分かった</div>
          <div>覚えていない：出ない、別人と混ざる</div>
          <div><b>復習</b></div>
          <div>復習モードは、忘れかけのものだけ出します。</div>
          <div><b>出題順</b></div>
          <div>新しい議員は一度に少人数ずつ出し、覚えきれていない議員を先に繰り返します。</div>
        </div>
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
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, minHeight: 320 },
  center: { margin: "auto", color: "#666", fontSize: 14 },
  imgBox: { display: "flex", justifyContent: "center" },
  img: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", objectFit: "cover", borderRadius: 12, background: "#f3f3f3" },
  noImg: { width: "min(320px, 80vw)", height: "min(320px, 80vw)", display: "flex", alignItems: "center", justifyContent: "center", color: "#777", background: "#f3f3f3", borderRadius: 12 },
  block: { display: "flex", flexDirection: "column", gap: 10 },
  msg: { fontSize: 15 },
  primaryBtn: { padding: "14px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontSize: 18, fontWeight: 700 },
  answerName: { fontSize: 24, fontWeight: 800, textAlign: "center" },
  answerGroup: { fontSize: 15, color: "#555", textAlign: "center" },
  guessBadge: { alignSelf: "center", padding: "4px 10px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
  gradeBtns: { display: "grid", gridTemplateColumns: "1fr", gap: 8 },
  btn: { padding: "12px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
};
