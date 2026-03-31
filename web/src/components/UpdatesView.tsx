import { useEffect, useMemo, useState } from 'react';
import type { Target } from './data';

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
  type: 'added' | 'removed' | 'changed';
  summary: string;
};

type UpdatesPayload = {
  generatedAt: string;
  totalChanges: number;
  hasUpdates: boolean;
  summaries: UpdateSummary[];
  items: UpdateItem[];
};

type HistoryEntry = {
  generatedAt: string;
  totalChanges: number;
  hasUpdates: boolean;
  viewedAt: string;
};

type Props = {
  onBack: () => void;
  onOpenPerson: (target: Target, name: string) => void;
};

const EMPTY_PAYLOAD: UpdatesPayload = {
  generatedAt: '',
  totalChanges: 0,
  hasUpdates: false,
  summaries: [],
  items: [],
};

const UPDATES_HISTORY_KEY = 'updates_history_v1';

function formatDateTime(value: string): string {
  if (!value) return '未生成';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function getTypeLabel(type: UpdateItem['type']): string {
  switch (type) {
    case 'added':
      return '追加';
    case 'removed':
      return '除外';
    default:
      return '変更';
  }
}

function readHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(UPDATES_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is HistoryEntry => Boolean(item && typeof item === 'object')) : [];
  } catch {
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(UPDATES_HISTORY_KEY, JSON.stringify(entries));
}

function saveHistoryEntry(payload: UpdatesPayload): HistoryEntry[] {
  if (!payload.generatedAt) return readHistory();

  const nextEntry: HistoryEntry = {
    generatedAt: payload.generatedAt,
    totalChanges: payload.totalChanges,
    hasUpdates: payload.hasUpdates,
    viewedAt: new Date().toISOString(),
  };

  const existing = readHistory().filter((entry) => entry.generatedAt !== nextEntry.generatedAt);
  const next = [nextEntry, ...existing].slice(0, 20);
  writeHistory(next);
  return next;
}

function toTarget(value: string): Target | null {
  switch (value) {
    case 'senators':
    case 'representatives':
    case 'ministers':
    case 'viceMinisters':
    case 'parliamentarySecretaries':
    case 'councilorsOfficersList':
    case 'houseOfficersList':
      return value;
    default:
      return null;
  }
}

export default function UpdatesView(props: Props) {
  const [payload, setPayload] = useState<UpdatesPayload>(EMPTY_PAYLOAD);
  const [history, setHistory] = useState<HistoryEntry[]>(() => readHistory());
  const [error, setError] = useState<string | null>(null);

  const baseUrl = import.meta.env.BASE_URL ?? '/';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setError(null);
        const response = await fetch(`${baseUrl}data/updates.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Failed to load: ${response.status}`);
        const json = (await response.json()) as Partial<UpdatesPayload>;
        if (cancelled) return;

        const nextPayload: UpdatesPayload = {
          generatedAt: typeof json.generatedAt === 'string' ? json.generatedAt : '',
          totalChanges: typeof json.totalChanges === 'number' ? json.totalChanges : 0,
          hasUpdates: json.hasUpdates === true,
          summaries: Array.isArray(json.summaries) ? json.summaries as UpdateSummary[] : [],
          items: Array.isArray(json.items) ? json.items as UpdateItem[] : [],
        };

        setPayload(nextPayload);
        setHistory(saveHistoryEntry(nextPayload));
      } catch (loadError) {
        console.error(loadError);
        if (!cancelled) {
          setPayload(EMPTY_PAYLOAD);
          setError('お知らせを取得できませんでした。');
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
        {error ? <div style={{ ...styles.sub, color: '#cf222e' }}>{error}</div> : null}
      </div>

      <div style={styles.card}>
        <div style={styles.sectionTitle}>更新状態</div>
        <div style={payload.hasUpdates && payload.totalChanges > 0 ? styles.statusChanged : styles.statusNoChanges}>
          <div style={styles.statusTitle}>{payload.hasUpdates && payload.totalChanges > 0 ? '更新あり' : '変更なし'}</div>
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
          <div style={styles.empty}>まだ履歴がありません。</div>
        ) : (
          <div style={styles.historyList}>
            {history.map((entry) => (
              <div key={entry.generatedAt} style={styles.historyCard}>
                <div style={styles.historyTitle}>{entry.hasUpdates && entry.totalChanges > 0 ? `変更 ${entry.totalChanges} 件` : '変更なし'}</div>
                <div style={styles.historyLine}>生成：{formatDateTime(entry.generatedAt)}</div>
                <div style={styles.historyLine}>確認：{formatDateTime(entry.viewedAt)}</div>
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
              const nextTarget = toTarget(item.target);
              const canOpen = item.type !== 'removed' && nextTarget !== null;

              return (
                <button
                  type="button"
                  key={`${item.target}-${item.name}-${index}`}
                  style={canOpen ? styles.itemCardButton : styles.itemCardDisabled}
                  onClick={() => {
                    if (!canOpen || nextTarget === null) return;
                    props.onOpenPerson(nextTarget, item.name);
                  }}
                  disabled={!canOpen}
                >
                  <div style={styles.itemMetaRow}>
                    <div style={styles.itemTarget}>{item.targetLabel}</div>
                    <div style={styles.itemType}>{getTypeLabel(item.type)}</div>
                  </div>
                  <div style={styles.itemName}>{item.name}</div>
                  <div style={styles.itemSummary}>{item.summary}</div>
                  <div style={styles.itemHint}>{canOpen ? '押すと一覧の該当議員へ移動します。' : '除外された項目のため移動できません。'}</div>
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
  wrap: { minHeight: '100vh', padding: 16, display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center', background: '#f7f8fa' },
  header: { width: 'min(720px, 100%)', display: 'flex', flexDirection: 'column', gap: 8 },
  backBtn: { alignSelf: 'flex-start', padding: '10px 12px', borderRadius: 10, border: '1px solid #999', background: '#fff' },
  h1: { fontSize: 22, fontWeight: 800 },
  sub: { fontSize: 13, color: '#444' },
  desc: { fontSize: 13, color: '#555' },
  card: { width: 'min(720px, 100%)', border: '1px solid #ddd', borderRadius: 12, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, background: '#fff' },
  sectionTitle: { fontSize: 18, fontWeight: 800 },
  empty: { fontSize: 14, color: '#555' },
  summaryGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  summaryCard: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: '#fbfcff' },
  summaryTitle: { fontWeight: 800 },
  summaryRow: { fontSize: 14, color: '#333' },
  list: { display: 'flex', flexDirection: 'column', gap: 10 },
  itemCardButton: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#fff', textAlign: 'left', cursor: 'pointer' },
  itemCardDisabled: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 8, background: '#f7f7f7', textAlign: 'left', color: '#666' },
  itemMetaRow: { display: 'flex', justifyContent: 'space-between', gap: 8 },
  itemTarget: { fontSize: 12, color: '#555' },
  itemType: { fontSize: 12, fontWeight: 800, color: '#0969da' },
  itemName: { fontSize: 18, fontWeight: 800 },
  itemSummary: { fontSize: 14, color: '#333' },
  itemHint: { fontSize: 12, color: '#666' },
  historyList: { display: 'flex', flexDirection: 'column', gap: 10 },
  historyCard: { border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6, background: '#fbfcff' },
  historyTitle: { fontSize: 15, fontWeight: 800 },
  historyLine: { fontSize: 13, color: '#444' },
  statusChanged: { border: '1px solid #f59e0b', background: '#fff7e8', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  statusNoChanges: { border: '1px solid #d1d5db', background: '#f9fafb', borderRadius: 12, padding: 12, display: 'flex', flexDirection: 'column', gap: 6 },
  statusTitle: { fontSize: 16, fontWeight: 800 },
  statusText: { fontSize: 14, color: '#333' },
};
