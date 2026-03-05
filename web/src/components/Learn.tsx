import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { applyGrade, type Grade, type ProgressItem } from "./srs";
import { appendHistory, loadProgress, saveProgress } from "./learnStorage";
import { bumpStats } from "./stats";
import { loadMasteredIds, loadWrongIds, saveMasteredIds, saveWrongIds } from "./progress";

type Senator = {
  id: number;
  name: string;
  group?: string;
  images: string[];
};

type Props = {
  mode: "learn" | "review";
  onBackTitle: () => void;
};

function pickNext(senators: Senator[], progress: Record<number, ProgressItem>, now: number, mode: "learn" | "review") {
  if (senators.length === 0) return null;

  const due: Senator[] = [];
  const fresh: Senator[] = [];
  let nearest: { s: Senator; due: number } | null = null;

  for (const s of senators) {
    const p = progress[s.id];
    if (!p) {
      if (mode === "learn") fresh.push(s);
      continue;
    }

    if (p.due <= now) due.push(s);

    if (!nearest || p.due < nearest.due) nearest = { s, due: p.due };
  }

  if (due.length > 0) return due[Math.floor(Math.random() * due.length)];
  if (mode === "review") return null; // 復習は期限切れのみ
  if (fresh.length > 0) return fresh[Math.floor(Math.random() * fresh.length)];
  return nearest?.s ?? null;
}

export default function Learn(props: Props) {
  const [helpOpen, setHelpOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [senators, setSenators] = useState<Senator[]>([]);
  const [revealed, setRevealed] = useState(false);

  const [progress, setProgress] = useState<Record<number, ProgressItem>>(() => loadProgress());

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}data/senators.json`;

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        const arr = Array.isArray(json) ? (json as Senator[]) : [];
        setSenators(arr);
      } catch (e) {
        console.error(e);
        setSenators([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl]);

  const current = useMemo(() => {
    const now = Date.now();
    return pickNext(senators, progress, now, props.mode);
  }, [senators, progress, props.mode]);

  const onGrade = (grade: Grade) => {
    if (!current) return;

    const now = Date.now();
    const prev = progress[current.id];
    const next = applyGrade(prev, current.id, grade, now);

    const nextMap = { ...progress, [current.id]: next };
    setProgress(nextMap);
    saveProgress(nextMap);
    appendHistory({ at: now, id: current.id, grade });

    // stats
    bumpStats({
      playedTotal: 1,
      correctTotal: grade === "again" ? 0 : 1,
      wrongTotal: grade === "again" ? 1 : 0,
    });

    // badges (一覧用)
    const wrong = new Set(loadWrongIds());
    const mastered = new Set(loadMasteredIds());

    if (grade === "again") wrong.add(current.id);
    else wrong.delete(current.id);

    // 「完全」は good で reps>=4 を目安（短期で増えすぎないように）
    if (grade === "good" && next.reps >= 4) mastered.add(current.id);

    saveWrongIds([...wrong]);
    saveMasteredIds([...mastered]);

    setRevealed(false);
  };

  const title = props.mode === "review" ? "復習（期限切れのみ）" : "学習（思い出して覚える）";

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBackTitle}>
          タイトルへ戻る
        </button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>{title}</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>
            ？
          </button>
        </div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={styles.card}>
        {loading ? (
          <div style={styles.center}>読み込み中</div>
        ) : !current ? (
          <div style={styles.center}>
            {props.mode === "review" ? "期限切れの復習がありません。" : "出題できる議員がありません。"}
          </div>
        ) : (
          <>
            <div style={styles.imgBox}>
              {current.images?.[0] ? (
                <img src={current.images[0]} alt={current.name} style={styles.img} />
              ) : (
                <div style={styles.noImg}>no image</div>
              )}
            </div>

            {!revealed ? (
              <div style={styles.block}>
                <div style={styles.msg}>名前を思い出してから、答えを表示してください。</div>
                <button type="button" style={styles.primaryBtn} onClick={() => setRevealed(true)}>
                  答えを見る
                </button>
              </div>
            ) : (
              <div style={styles.block}>
                <div style={styles.answerName}>{(current.name ?? "").split("：")[0].split(":")[0]}</div>
                <div style={styles.answerGroup}>{current.group ?? ""}</div>

                <div style={styles.gradeBtns}>
                  <button type="button" style={styles.btn} onClick={() => onGrade("good")}>
                    覚えていた
                  </button>
                  <button type="button" style={styles.btn} onClick={() => onGrade("hard")}>
                    うろ覚え
                  </button>
                  <button type="button" style={styles.btn} onClick={() => onGrade("again")}>
                    覚えていない
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <HelpModal open={helpOpen} title="ヘルプ" onClose={() => setHelpOpen(false)}>
        <div>
          <div style={{ fontWeight: 800 }}>やり方</div>
          <div>顔を見て、名前を思い出してから「答えを見る」を押します。</div>

          <div style={{ marginTop: 10, fontWeight: 800 }}>自己判定</div>
          <div>「覚えていない」はすぐ再出題されます。</div>
          <div>「覚えていた」は出題間隔が伸びます。</div>

          <div style={{ marginTop: 10, fontWeight: 800 }}>復習モード</div>
          <div>期限切れ（忘れかけ）のものだけ出します。</div>
        </div>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: {
    minHeight: "100vh",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    alignItems: "center",
  },
  header: {
    width: "min(720px, 100%)",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  backBtn: {
    alignSelf: "flex-start",
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
  },
  helpBtn: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
    fontWeight: 800,
    width: 44,
  },
  h1: {
    fontSize: 20,
    fontWeight: 800,
  },
  sub: {
    fontSize: 13,
    color: "#666",
  },
  card: {
    width: "min(720px, 100%)",
    border: "1px solid #ddd",
    borderRadius: 12,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 320,
  },
  center: {
    margin: "auto",
    color: "#666",
    fontSize: 14,
  },
  imgBox: {
    display: "flex",
    justifyContent: "center",
  },
  img: {
    width: "min(320px, 80vw)",
    height: "min(320px, 80vw)",
    objectFit: "cover",
    borderRadius: 12,
    border: "1px solid #eee",
    background: "#fafafa",
  },
  noImg: {
    width: 240,
    height: 240,
    borderRadius: 12,
    border: "1px solid #eee",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#999",
  },
  block: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
    alignItems: "center",
  },
  msg: {
    fontSize: 14,
    color: "#444",
    textAlign: "center",
  },
  primaryBtn: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #0969da",
    background: "#eef6ff",
    fontSize: 18,
    fontWeight: 800,
  },
  answerName: {
    fontSize: 22,
    fontWeight: 900,
  },
  answerGroup: {
    fontSize: 14,
    color: "#333",
  },
  gradeBtns: {
    width: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 10,
    marginTop: 4,
  },
  btn: {
    width: "100%",
    padding: "14px 12px",
    borderRadius: 10,
    border: "1px solid #999",
    background: "#fff",
    fontSize: 18,
    fontWeight: 700,
  },
};
