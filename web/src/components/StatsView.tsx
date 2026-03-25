import { useEffect, useMemo, useState } from "react";
import { loadProgress } from "./learnStorage";
import { parsePersonsJson, targetDataPath, targetLabels, type Person, type Target } from "./data";
import { loadMasteredIds, loadWrongIds } from "./progress";
import { resetStats } from "./stats";

type Props = {
  target: Target;
  onBack: () => void;
};

type Summary = {
  total: number;
  remembered: number;
  hazy: number;
  notRemembered: number;
  notChecked: number;
};

export default function StatsView(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setLoadError(null);
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        const parsed = parsePersonsJson(json, props.target);
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
  }, [dataUrl]);

  const summary = useMemo<Summary>(() => {
    const validIds = new Set(items.map((item) => item.id));
    const progress = loadProgress(props.target);
    const seenIds = new Set(
      Object.keys(progress)
        .map((key) => Number(key))
        .filter((id) => Number.isFinite(id) && validIds.has(id))
    );

    const rememberedIds = new Set(loadMasteredIds(props.target).filter((id) => validIds.has(id)));
    const wrongIds = new Set(loadWrongIds(props.target).filter((id) => validIds.has(id) && !rememberedIds.has(id)));

    let hazy = 0;
    for (const id of seenIds) {
      if (rememberedIds.has(id) || wrongIds.has(id)) continue;
      hazy += 1;
    }

    const total = items.length;
    const remembered = rememberedIds.size;
    const notRemembered = wrongIds.size;
    const notChecked = Math.max(total - remembered - hazy - notRemembered, 0);

    return {
      total,
      remembered,
      hazy,
      notRemembered,
      notChecked,
    };
  }, [items, props.target]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>成績確認</div>
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <div style={styles.desc}>合計が総人数と一致するように集計しています。</div>
        {loadError ? <div style={{ ...styles.sub, color: "#cf222e" }}>{loadError}</div> : null}
      </div>

      <div style={styles.card}>
        <div style={styles.row}><div style={styles.k}>総人数</div><div style={styles.v}>{summary.total}</div></div>
        <div style={styles.row}><div style={styles.k}>覚えた人数</div><div style={styles.v}>{summary.remembered}</div></div>
        <div style={styles.row}><div style={styles.k}>うろ覚えの人数</div><div style={styles.v}>{summary.hazy}</div></div>
        <div style={styles.row}><div style={styles.k}>覚えてない人数</div><div style={styles.v}>{summary.notRemembered}</div></div>
        <div style={styles.row}><div style={styles.k}>まだ確認してない人数</div><div style={styles.v}>{summary.notChecked}</div></div>
        <div style={styles.totalCheck}>内訳合計：{summary.remembered + summary.hazy + summary.notRemembered + summary.notChecked}</div>
        <button type="button" style={styles.dangerBtn} onClick={() => { resetStats(props.target); location.reload(); }}>成績リセット</button>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center", background: "#f7f8fa" },
  header: { width: "min(720px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  h1: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: "#444" },
  desc: { fontSize: 13, color: "#555" },
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 10, background: "#fff" },
  row: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #eee" },
  k: { fontWeight: 700 }, v: { fontWeight: 800 },
  totalCheck: { paddingTop: 6, fontSize: 13, color: "#555", textAlign: "right" },
  dangerBtn: { marginTop: 10, padding: "12px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 800 },
};
