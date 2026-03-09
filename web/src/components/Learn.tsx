import { useEffect, useMemo, useRef, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadProgress, saveProgress } from "./learnStorage";
import { parsePeopleJson, TARGET_DATA_PATH, TARGET_LABEL, type Person, type TargetKey, cleanDisplayName } from "./data";
import SafeImage from "./SafeImage";
import type { Options } from "./optionsStore";

type Props = {
  target: TargetKey;
  mode: "learn" | "review" | "reverse" | "autoplay";
  options: Options;
  onBackTitle: () => void;
};

function pickDue(people: Person[], progress: Record<number, ProgressItem>, now: number) {
  return people.filter((p) => (progress[p.id]?.due ?? 0) <= now && progress[p.id]);
}

function pickFresh(people: Person[], progress: Record<number, ProgressItem>) {
  return people.filter((p) => !progress[p.id]);
}

function randomPick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)] ?? null;
}

function pickNext(people: Person[], progress: Record<number, ProgressItem>, now: number, mode: Props["mode"], lastId?: number | null) {
  const due = pickDue(people, progress, now).filter((p) => p.id !== lastId);
  const fresh = pickFresh(people, progress).filter((p) => p.id !== lastId);
  if (mode === "review") return randomPick(due);
  if (due.length > 0) return randomPick(due);
  if (fresh.length > 0) return randomPick(fresh);
  const sorted = [...people]
    .filter((p) => p.id !== lastId)
    .sort((a, b) => (progress[a.id]?.due ?? Number.MAX_SAFE_INTEGER) - (progress[b.id]?.due ?? Number.MAX_SAFE_INTEGER));
  return sorted[0] ?? people[0] ?? null;
}

export default function Learn(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress(props.target));
  const [revealed, setRevealed] = useState(false);
  const [showNameFirst, setShowNameFirst] = useState(true);
  const [lastId, setLastId] = useState<number | null>(null);
  const timerRef = useRef<number | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${TARGET_DATA_PATH[props.target]}`;

  useEffect(() => {
    setProgress(loadProgress(props.target));
  }, [props.target]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setPeople(parsePeopleJson(json));
      } catch (e) {
        console.error(e);
        setPeople([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const current = useMemo(() => pickNext(people, progress, Date.now(), props.mode, lastId), [people, progress, props.mode, lastId]);

  const commitGrade = (grade: Grade) => {
    if (!current) return;
    const now = Date.now();
    const nextItem = applyGrade(progress[current.id], current.id, grade, now);
    const nextMap = { ...progress, [current.id]: nextItem };
    setProgress(nextMap);
    saveProgress(props.target, nextMap);
    appendHistory(props.target, { at: now, id: current.id, grade });
    setRevealed(false);
    setShowNameFirst(true);
    setLastId(current.id);
  };

  useEffect(() => {
    if (props.mode !== "autoplay" || !current) return;
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setShowNameFirst(true);
    setRevealed(false);
    timerRef.current = window.setTimeout(() => {
      setShowNameFirst(false);
      setRevealed(true);
      timerRef.current = window.setTimeout(() => {
        commitGrade("good");
      }, props.options.autoAnswerSeconds * 1000);
    }, props.options.autoFaceSeconds * 1000);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, props.mode, props.options.autoFaceSeconds, props.options.autoAnswerSeconds]);

  const title = props.mode === "learn"
    ? `学習（${TARGET_LABEL[props.target]} / 顔→名前）`
    : props.mode === "reverse"
      ? `逆学習（${TARGET_LABEL[props.target]} / 名前→顔）`
      : props.mode === "review"
        ? `復習（${TARGET_LABEL[props.target]}）`
        : `自動再生（${TARGET_LABEL[props.target]}）`;

  if (loading) return <SimpleWrap title={title} onBack={props.onBackTitle}>読み込み中です。</SimpleWrap>;
  if (error) return <SimpleWrap title={title} onBack={props.onBackTitle}>{error}</SimpleWrap>;
  if (!current) return <SimpleWrap title={title} onBack={props.onBackTitle}>出題できるデータがありません。</SimpleWrap>;

  const displayName = cleanDisplayName(current.name);
  const imgUrl = current.images?.[0] ?? "";
  const isReverse = props.mode === "reverse";

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBackTitle}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>{title}</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
      </div>

      <div style={styles.card}>
        {isReverse ? (
          <>
            <div style={styles.nameBig}>{displayName}</div>
            <div style={styles.group}>{current.group ?? ""}</div>
            {!revealed ? (
              <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>顔を見る</button>
            ) : (
              <div style={styles.imageWrap}>
                <SafeImage src={imgUrl} alt={displayName} style={styles.image} fallbackStyle={styles.noImage} fallbackText="画像なし" />
              </div>
            )}
          </>
        ) : props.mode === "autoplay" ? (
          <>
            {showNameFirst ? (
              <div style={styles.imageWrap}>
                <SafeImage src={imgUrl} alt={displayName} style={styles.image} fallbackStyle={styles.noImage} fallbackText="画像なし" />
              </div>
            ) : (
              <>
                <div style={styles.imageWrap}>
                  <SafeImage src={imgUrl} alt={displayName} style={styles.image} fallbackStyle={styles.noImage} fallbackText="画像なし" />
                </div>
                <div style={styles.nameBig}>{displayName}</div>
                <div style={styles.group}>{current.group ?? ""}</div>
              </>
            )}
          </>
        ) : (
          <>
            <div style={styles.imageWrap}>
              <SafeImage src={imgUrl} alt={displayName} style={styles.image} fallbackStyle={styles.noImage} fallbackText="画像なし" />
            </div>
            {!revealed ? (
              <>
                <div style={styles.note}>3秒以内に出なければ、考え込まずに答えを見てください。</div>
                <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>答えを見る</button>
              </>
            ) : (
              <>
                <div style={styles.nameBig}>{displayName}</div>
                <div style={styles.group}>{current.group ?? ""}</div>
              </>
            )}
          </>
        )}

        {(revealed || props.mode === "autoplay") ? (
          props.mode === "autoplay" ? null : (
            <div style={styles.actions}>
              <button type="button" style={styles.gradeBtn} onClick={() => commitGrade("good")}>覚えていた</button>
              <button type="button" style={styles.gradeBtn} onClick={() => commitGrade("hard")}>うろ覚え</button>
              <button type="button" style={styles.gradeBtn} onClick={() => commitGrade("again")}>覚えていない</button>
            </div>
          )
        ) : null}
      </div>

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title={`ヘルプ（${title}）`}>
        <p>分からないときは考え込まずに進む方が、顔と名前は定着しやすいです。</p>
        <p>目安は3秒です。3秒で出なければ、答えを見て次へ進んでください。</p>
        <p>覚えていた：3秒以内にほぼ確信で出た。</p>
        <p>うろ覚え：少し迷った、苗字だけ、答えを見て「ああそれだ」。</p>
        <p>覚えていない：出ない、別人と混ざる、答えを見ても弱い。</p>
        {props.mode === "autoplay" ? <p>自動再生は、顔→名前の切り替えを自動で進めます。表示時間はオプションで変更できます。</p> : null}
        {props.mode === "reverse" ? <p>逆学習は、名前から顔を思い出す練習です。通常学習と組み合わせると定着しやすくなります。</p> : null}
      </HelpModal>
    </div>
  );
}

function SimpleWrap({ title, onBack, children }: { title: string; onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>{title}</div>
      </div>
      <div style={styles.card}>{children}</div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerRow: { display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { width: 40, height: 40, borderRadius: 999, border: "1px solid #999", background: "#fff", fontSize: 18, fontWeight: 800 },
  h1: { fontSize: 22, fontWeight: 800 },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  imageWrap: { width: "min(320px, 100%)", aspectRatio: "3 / 4", borderRadius: 12, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "100%", objectFit: "cover" },
  noImage: { fontSize: 14, color: "#777" },
  primaryBtn: { width: "100%", padding: "14px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", fontSize: 18, fontWeight: 800 },
  gradeBtn: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontSize: 16 },
  actions: { width: "100%", display: "flex", flexDirection: "column", gap: 8 },
  nameBig: { fontSize: 28, fontWeight: 800, textAlign: "center" },
  group: { fontSize: 16, color: "#444", textAlign: "center" },
  note: { fontSize: 14, color: "#444", textAlign: "center" },
};
