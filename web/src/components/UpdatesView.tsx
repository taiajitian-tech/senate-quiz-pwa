import { useEffect, useMemo, useState } from 'react';
import type { Target } from './data';
import { getNoticeKey, markNoticesRead, newestNoticesFirst, noticePresentation, readNoticeKeys, type NoticeIdentity } from './updateNotices';
import './UpdatesView.css';

type UpdateItem = NoticeIdentity & {
  targetLabel: string;
  reason?: { label: string; confidence: string; sourceTitle?: string; sourceUrl?: string };
};
type Payload = { generatedAt: string; checkedAt: string; items: UpdateItem[] };
type Props = { onBack: () => void; onOpenPerson: (target: Target, name: string) => void };

function dateText(value: string, withTime = false) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return '未確認';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } as const : {}),
  }).format(date);
}

function personTarget(item: UpdateItem): Target | null {
  const targets: string[] = ['senators', 'representatives', 'ministers', 'viceMinisters', 'parliamentarySecretaries', 'councilorsOfficersList', 'houseOfficersList'];
  return item.type !== 'removed' && targets.includes(item.target) ? item.target as Target : null;
}

function safeLink(value = '') {
  return /^https:\/\//u.test(value) ? value : undefined;
}

function NoticeCard({ item, onOpenPerson, onConfirm }: { item: UpdateItem; onOpenPerson: Props['onOpenPerson']; onConfirm?: () => void }) {
  const presentation = noticePresentation(item);
  const target = personTarget(item);
  const source = safeLink(item.sourceUrl);
  return <article className="notice-card">
    <div className="notice-card-meta"><span>{item.targetLabel}</span><span>{item.type === 'added' ? '追加' : item.type === 'removed' ? '掲載終了' : '変更'}</span></div>
    <h3>{presentation.headline}</h3>
    {item.target !== 'notice' && <p className="notice-effective-date">変更日：{dateText(presentation.effectiveAt)}</p>}
    {presentation.comparison && <dl className="notice-comparison">
      <div><dt>変更前</dt><dd>{presentation.comparison.before}</dd></div>
      <div><dt>変更後</dt><dd>{presentation.comparison.after}</dd></div>
    </dl>}
    <details className="notice-details"><summary>詳細を見る</summary>
      <p>{item.summary}</p>
      {item.changes && item.changes.length > 0 && <dl>{item.changes.map(change => <div key={change.field}>
        <dt>{change.label}</dt><dd>{change.field === 'image' ? '顔写真が変更されています。' : <>{change.before}<br />↓<br />{change.after}</>}</dd>
      </div>)}</dl>}
      {source && <p><a href={source} target="_blank" rel="noreferrer">{item.sourceLabel || '公式発表を見る'}</a></p>}
      {item.reason && <p className="notice-reason">参考報道：{item.reason.label}{item.reason.sourceTitle ? `（${item.reason.sourceTitle}）` : ''}
        {safeLink(item.reason.sourceUrl) && <> <a href={item.reason.sourceUrl} target="_blank" rel="noreferrer">記事を見る</a></>}
      </p>}
      {item.detectedAt && <p className="notice-small">アプリでの確認：{dateText(item.detectedAt, true)}</p>}
      {target && <button type="button" onClick={() => onOpenPerson(target, item.name)}>議員の情報を見る</button>}
    </details>
    {onConfirm && <button type="button" className="notice-confirm" onClick={onConfirm}>確認済みにする</button>}
  </article>;
}

export default function UpdatesView({ onBack, onOpenPerson }: Props) {
  const [payload, setPayload] = useState<Payload>({ generatedAt: '', checkedAt: '', items: [] });
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const baseUrl = import.meta.env.BASE_URL ?? '/';
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${baseUrl}data/updates.json`, { cache: 'no-store' });
        if (!response.ok) throw new Error('取得失敗');
        const json = await response.json() as Partial<Payload>;
        if (cancelled) return;
        const next = { generatedAt: json.generatedAt || '', checkedAt: json.checkedAt || json.generatedAt || '', items: Array.isArray(json.items) ? json.items : [] };
        setSeen(readNoticeKeys(next.items, next.generatedAt));
        setPayload(next);
        // 今回表示した分は、次に開くときから既読にする。
        markNoticesRead(next.items, next.generatedAt);
      } catch {
        if (!cancelled) setError('お知らせを読み込めませんでした。');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [baseUrl, retry]);
  const sorted = useMemo(() => newestNoticesFirst(payload.items), [payload.items]);
  const unread = sorted.filter(item => !seen.has(getNoticeKey(item)));
  const past = sorted.filter(item => seen.has(getNoticeKey(item)));
  const confirm = (items: UpdateItem[]) => setSeen(previous => new Set([...previous, ...items.map(getNoticeKey)]));
  return <div className="updates-view">
    <header className="updates-header">
      <button type="button" onClick={onBack}>タイトルへ戻る</button>
      <h1>お知らせ</h1>
      <p className="notice-small">最終確認：{dateText(payload.checkedAt, true)}</p>
    </header>
    {loading ? <p role="status">お知らせを読み込み中…</p> : error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => { setError(''); setLoading(true); setRetry(value => value + 1); }}>再読込</button></div> : <>
      <section aria-labelledby="new-notices-heading">
        <div className="notice-section-title"><h2 id="new-notices-heading">新着のお知らせ <span>{unread.length}件</span></h2>
          {unread.length > 0 && <button type="button" onClick={() => confirm(unread)}>すべて確認済み</button>}
        </div>
        {unread.length ? <div className="notice-list">{unread.map(item => <NoticeCard key={getNoticeKey(item)} item={item} onOpenPerson={onOpenPerson} onConfirm={() => confirm([item])} />)}</div>
          : <p className="notice-empty">新しいお知らせはありません。</p>}
      </section>
      <details className="notice-past"><summary>過去のお知らせ（確認済み {past.length}件）</summary>
        {past.length ? <div className="notice-list">{past.map(item => <NoticeCard key={getNoticeKey(item)} item={item} onOpenPerson={onOpenPerson} />)}</div>
          : <p className="notice-empty">確認済みのお知らせはありません。</p>}
      </details>
    </>}
  </div>;
}
