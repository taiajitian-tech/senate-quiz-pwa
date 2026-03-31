import { useEffect, useMemo, useState } from "react";
import { getTargetTabs, type Target } from "./data";

type UpdateSummary = {
  target: string;
  label: string;
  added: number;
  removed: number;
  changed: number;
  total: number;
};

type UpdateItem = {
  target: string;
  targetLabel: string;
  name: string;
  type: "added" | "removed" | "changed";
  summary: string;
};

type UpdatesPayload = {
  generatedAt: string;
  totalChanges: number;
  hasUpdates: boolean;
  summaries: UpdateSummary[];
  items: UpdateItem[];
};

type UpdatesHistoryEntry = {
  generatedAt: string;
  totalChanges: number;
  hasUpdates: boolean;
};

type Props = {
  onBack: () => void;
  onOpenPerson: (target: Target, name: string) => void;
};

const UPDATES_HISTORY_KEY = "updates_history_v1";

const EMPTY_PAYLOAD: UpdatesPayload = {
  generatedAt: "",
  totalChanges: 0,
  hasUpdates: false,
  summaries: [],
  items: [],
};

function formatDateTime(value: string): string {
  if (!value) return "未生成";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getTypeLabel(type: UpdateItem["type"]): string {
  switch (type) {
    case "added":
      return "追加";
    case "removed":
      return "除外";
    default:
      return "変更";
  }
}

function isTarget(value: string): value is Target {
  return value in getTargetTabs("basic");
}

function readHistory(): UpdatesHistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(UPDATES_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is UpdatesHistoryEntry => {
      return Boolean(item) && typeof item === "object" && typeof (item as UpdatesHistoryEntry).generatedAt === "string";
    });
  } catch {
    return [];
  }
}

function writeHistory(entries: UpdatesHistoryEntry[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UPDATES_HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
}

function pushHistory(payload: UpdatesPayload): UpdatesHistoryEntry[] {
  if (!payload.generatedAt) return readHistory();
  const rest = readHistory().filter((entry) => entry.generatedAt !== payload.generatedAt);
  const next: UpdatesHistoryEntry[] = [{
    generatedAt: payload.generatedAt,
    totalChanges: payload.totalChanges,
    hasUpdates: payload.hasUpdates,
  }, ...rest].slice(0, 20);
  writeHistory(next);
  return next;
}

export default function UpdatesView(props: Props) {
  const [payload, setPayload] = useState<UpdatesPayload>(EMPTY_PAYLOAD);
  const [history, setHistory] = useState<UpdatesHistoryEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? "/";

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const response = await fetch(`${baseUrl}data/updates.json`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
        const json = (await response.json()) as Partial<UpdatesPayload>;
        if (cancelled) return;
        const nextPayload: UpdatesPayload = {
          generatedAt: typeof json.generatedAt === "string" ? json.generatedAt : "",
          totalChanges: typeof json.totalChanges === "number" ? json.totalChanges : 0,
          hasUpdates: json.hasUpdates === true,
          summaries: Array.isArray(json.summaries) ? (json.summaries as UpdateSummary[]) : [],
          items: Array.isArray(json.items) ? (json.items as UpdateItem[]) : [],
        };
        setPayload(nextPayload);
        setHistory(pushHistory(nextPayload));
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setPayload(EMPTY_PAYLOAD);
          setHistory(readHistory());
          setError("お知らせを取得できませんでした。");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [baseUrl]);

  const totalsText = useMemo(() => {
    if (!payload.hasUpdates || payload.totalChanges <= 0) return `変更なし（${formatDateTime(payload.generatedAt)} 確認）`;
    return `変更 ${payload.totalChanges} 件`;
  }, [payload.generatedAt, payload.hasUpdates, payload.totalChanges]);

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.h1}>お知らせ</div>
        <div style={styles.sub}>最終生成：{formatDateTime(payload.generatedAt)}</div>
        <div style={styles.desc}>{totalsText}</div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>更新状態</div>
        <div style={payload.hasUpdates && payload.totalChanges > 0 ? styles.statusChanged : styles.statusNoChanges}>
          <div style={styles.statusTitle}>{payload.hasUpdates && payload.totalChanges > 0 ? "更新あり" : "変更なし"}</div>
          <div style={styles.statusText}>
            {payload.hasUpdates && payload.totalChanges > 0
              ? `今回の自動更新で ${payload.totalChanges} 件の変更を検出しました。`
              : `最終確認 ${formatDateTime(payload.generatedAt)} の時点では変更を検出していません。`}
          </div>
        </div>
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>履歴</div>
        {history.length === 0 ? (
          <div style={styles.empty}>まだ履歴はありません。</div>
        ) : (
          <div style={styles.historyList}>
            {history.map((entry) => (
              <div key={entry.generatedAt} style={styles.historyItem}>
                <div style={styles.historyDate}>{formatDateTime(entry.generatedAt)}</div>
                <div style={styles.historyText}>{entry.hasUpdates && entry.totalChanges > 0 ? `変更 ${entry.totalChanges} 件` : "変更なし"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>区分ごとの変更</div>
        {payload.summaries.length === 0 ? (
          <div style={styles.empty}>現在は変更点がありません。</div>
        ) : (
          <div style={styles.summaryGrid}>
            {payload.summaries.map((summary) => (
              <div key={summary.target} style={styles.summaryCard}>
                <div style={styles.summaryTitle}>{summary.label}</div>
                <div style={styles.summaryRow}>追加 {summary.added} 件</div>
                <div style={styles.summaryRow}>変更 {summary.changed} 件</div>
                <div style={styles.summaryRow}>除外 {summary.removed} 件</div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>変更一覧</div>
        {payload.items.length === 0 ? (
          <div style={styles.empty}>表示する変更はありません。</div>
        ) : (
          <div style={styles.list}>
            {payload.items.map((item, index) => {
              const clickable = isTarget(item.target) && item.type !== "removed";
              return (
                <button
                  key={`${item.target}-${item.name}-${index}`}
                  type="button"
                  style={clickable ? styles.itemCardButton : styles.itemCardStatic}
                  onClick={() => {
                    if (!clickable) return;
                    props.onOpenPerson(item.target as Target, item.name);
                  }}
                  disabled={!clickable}
                >
                  <div style={styles.itemMetaRow}>
                    <div style={styles.itemTarget}>{item.targetLabel}</div>
                    <div style={styles.itemType}>{getTypeLabel(item.type)}</div>
                  </div>
                  <div style={styles.itemName}>{item.name}</div>
                  <div style={styles.itemSummary}>{item.summary}</div>
                  {clickable ? <div style={styles.itemLinkHint}>押すと一覧の個別表示へ移動</div> : null}
                </button>
              );
            })}
          </div>
        )}
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
  card: { width: "min(720px, 100%)", border: "1px solid #ddd", borderRadius: 12, padding: 14, display: "flex", flexDirection: "column", gap: 12, background: "#fff" },
  sectionTitle: { fontSize: 18, fontWeight: 800 },
  empty: { fontSize: 14, color: "#555" },
  historyList: { display: "flex", flexDirection: "column", gap: 8 },
  historyItem: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", justifyContent: "space-between", gap: 8, background: "#fbfcff", flexWrap: "wrap" },
  historyDate: { fontSize: 14, fontWeight: 700 },
  historyText: { fontSize: 14, color: "#333" },
  summaryGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 },
  summaryCard: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6, background: "#fbfcff" },
  summaryTitle: { fontWeight: 800 },
  summaryRow: { fontSize: 14, color: "#333" },
  list: { display: "flex", flexDirection: "column", gap: 10 },
  itemCardButton: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#fff", textAlign: "left", cursor: "pointer" },
  itemCardStatic: { border: "1px solid #e5e7eb", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 8, background: "#f8f8f8", textAlign: "left" },
  itemMetaRow: { display: "flex", justifyContent: "space-between", gap: 8 },
  itemTarget: { fontSize: 12, color: "#555" },
  itemType: { fontSize: 12, fontWeight: 800, color: "#0969da" },
  itemName: { fontSize: 18, fontWeight: 800 },
  itemSummary: { fontSize: 14, color: "#333" },
  itemLinkHint: { fontSize: 12, color: "#0969da" },
  statusChanged: { border: "1px solid #d1242f", background: "#fff5f5", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 },
  statusNoChanges: { border: "1px solid #1f883d", background: "#f3fff6", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 6 },
  statusTitle: { fontWeight: 800, fontSize: 16 },
  statusText: { fontSize: 14, color: "#333" },
};
