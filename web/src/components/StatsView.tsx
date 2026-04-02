import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { loadProgress } from "./learnStorage";
import { estimateRecallProbability, isMastered } from "./srs";
import { getTargetLabels, loadPersonsForTarget, type AppMode, type Person, type Target } from "./data";
import { resetStats } from "./stats";

type Props = {
  appMode: AppMode;
  target: Target;
  onBack: () => void;
};

type Summary = {
  total: number;
  remembered: number;
  hazy: number;
  notRemembered: number;
  notChecked: number;
  dueSoon: number;
  leech: number;
};

export default function StatsView(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        setLoadError(null);
        const parsed = await loadPersonsForTarget(baseUrl, props.target, props.appMode);
        if (!cancelled) setItems(parsed);
      } catch (error) {
        console.error(error);
        if (!cancelled) {
          setItems([]);
          setLoadError("人数を取得できませんでした。");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl, props.appMode, props.target]);

  const summary = useMemo<Summary>(() => {
    const validIds = new Set(items.map((item) => item.id));
    const progress = loadProgress(props.appMode, props.target);
    const now = Date.now();

    let remembered = 0;
    let notRemembered = 0;
    let hazy = 0;
    let dueSoon = 0;
    let leech = 0;

    for (const item of items) {
      const state = progress[item.id];
      if (!state || !validIds.has(item.id)) continue;

      if (isMastered(state, now)) {
        remembered += 1;
        continue;
      }

      if (state.status === "leech") {
        notRemembered += 1;
        leech += 1;
        continue;
      }

      const retention = estimateRecallProbability(state, now);
      const dueWithinWeek = state.due <= now || state.due - now <= 7 * 24 * 60 * 60 * 1000;
      if (dueWithinWeek || retention <= 0.55) dueSoon += 1;

      if (state.lastGrade === "again" || retention < 0.35 || state.lapses >= 2) {
        notRemembered += 1;
      } else {
        hazy += 1;
      }
    }

    const total = items.length;
    const notChecked = Math.max(total - remembered - hazy - notRemembered, 0);

    return {
      total,
      remembered,
      hazy,
      notRemembered,
      notChecked,
      dueSoon,
      leech,
    };
  }, [items, props.appMode, props.target]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>成績確認</div>
        <div style={styles.sub}>{getTargetLabels(props.appMode)[props.target]}</div>
        <div style={styles.desc}>完全習得は通常出題から外れます。要復習と苦手人数も確認できます。</div>
        {loadError ? <div style={{ ...styles.sub, color: "#cf222e" }}>{loadError}</div> : null}
      </div>

      <div style={styles.card}>
        <div style={styles.row}><div style={styles.k}>総人数</div><div style={styles.v}>{summary.total}</div></div>
        <div style={styles.row}><div style={styles.k}>完全習得</div><div style={styles.v}>{summary.remembered}</div></div>
        <div style={styles.row}><div style={styles.k}>うろ覚え</div><div style={styles.v}>{summary.hazy}</div></div>
        <div style={styles.row}><div style={styles.k}>苦手・覚えてない</div><div style={styles.v}>{summary.notRemembered}</div></div>
        <div style={styles.row}><div style={styles.k}>まだ確認してない</div><div style={styles.v}>{summary.notChecked}</div></div>
        <div style={styles.row}><div style={styles.k}>近いうちに復習が必要</div><div style={styles.v}>{summary.dueSoon}</div></div>
        <div style={styles.row}><div style={styles.k}>苦手として追跡中</div><div style={styles.v}>{summary.leech}</div></div>
        <div style={styles.totalCheck}>内訳合計：{summary.remembered + summary.hazy + summary.notRemembered + summary.notChecked}</div>
        <button
          type="button"
          style={styles.dangerBtn}
          onClick={() => {
            resetStats(props.appMode, props.target);
            location.reload();
          }}
        >
          成績リセット
        </button>
      </div>
    </div>
  );
}

const styles: Record<string, CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", background: "#f7f8fa" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#444" },
  desc: { fontSize: 13, color: "#555" },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#fff" },
  row: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" },
  k: { fontWeight: 700 },
  v: { fontWeight: 800 },
  totalCheck: { paddingTop: 6, fontSize: 13, color: "#555", textAlign: "right" },
  dangerBtn: { marginTop: 10, padding: "12px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 800 },
};
