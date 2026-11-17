import { useEffect, useMemo, useRef, useState } from 'react';
import { loadPersonsForTarget, type Person, type Target } from './data';
import { buildSearchIndex, searchPeople, SEARCH_TARGETS, type SearchEntry } from './memberSearchIndex';
import SafeImage from './SafeImage';
import './PersonSearch.css';

type Props = { query: string; onChangeQuery: (query: string) => void };

export default function PersonSearch({ query, onChangeQuery }: Props) {
  const [rosters, setRosters] = useState<Partial<Record<Target, Person[]>>>({});
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [expandedQuery, setExpandedQuery] = useState('');
  const [selected, setSelected] = useState<SearchEntry | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || '/';
    Promise.allSettled(SEARCH_TARGETS.map(async target => [target, await loadPersonsForTarget(base, target, 'basic')] as const)).then(results => {
      if (cancelled) return;
      setRosters(Object.fromEntries(results.flatMap(result => result.status === 'fulfilled' ? [result.value] : [])));
      setFailed(results.some(result => result.status === 'rejected'));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [retry]);
  useEffect(() => {
    if (selected && dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
  }, [selected]);
  const index = useMemo(() => buildSearchIndex(rosters), [rosters]);
  const matches = useMemo(() => searchPeople(index, query), [index, query]);
  const active = !!query.trim();
  const visible = expandedQuery === query ? matches : matches.slice(0, 8);
  return <section className="person-search" aria-label="議員検索">
    <form role="search" onSubmit={event => { event.preventDefault(); if (active) setExpandedQuery(query); }}>
      <label htmlFor="home-person-search">議員を検索</label>
      <div className="person-search-row"><input id="home-person-search" type="search" enterKeyHint="search" value={query}
        onChange={event => onChangeQuery(event.target.value)} placeholder="名前・ふりがな・役職など"
        aria-describedby="home-search-target" aria-controls="home-search-results" />
        <button type="submit" disabled={!active}>検索</button>
      </div>
      <p id="home-search-target">衆議院・参議院・大臣・副大臣・政務官・両院役員をまとめて検索</p>
    </form>
    {active && <div id="home-search-results" className="person-search-results">
      <p role="status">{loading ? '名簿を読み込み中…' : matches.length ? `${matches.length}人が見つかりました` : failed ? '読み込めた名簿に候補はありません。再読込してください。' : '該当する議員はいません。'}</p>
      {visible.length > 0 && <ul key={query}>{visible.map(entry => <li key={entry.key}>
        <button type="button" className="person-search-candidate" onClick={() => setSelected(entry)}>
          <span className="person-search-name">{entry.person.name}<small>{entry.person.kana}</small></span>
          <span className="person-search-info">{[entry.chamber, entry.roles[0] || entry.party, entry.person.district].filter(Boolean).join(' ／ ')}</span>
        </button>
      </li>)}</ul>}
      {matches.length > visible.length && <button type="button" className="person-search-more" onClick={() => setExpandedQuery(query)}>すべての候補を表示（{matches.length}人）</button>}
    </div>}
    {failed && <p className="person-search-error" role="alert">一部の名簿を読み込めませんでした。<button type="button" onClick={() => { setLoading(true); setFailed(false); setRetry(value => value + 1); }}>再読込</button></p>}
    {selected && <dialog ref={dialogRef} className="person-search-dialog" aria-labelledby="search-person-name" onClose={() => setSelected(null)}>
      <div className="person-search-dialog-heading"><h2 id="search-person-name">{selected.person.name}</h2><button type="button" onClick={() => dialogRef.current?.close()}>閉じる</button></div>
      <SafeImage key={selected.key} src={selected.person.images[0] || ''} alt={selected.person.name} style={{ width: '100%', maxHeight: '38vh', objectFit: 'contain' }} fallbackText="写真なし" />
      <p>{selected.person.kana}</p>
      <dl><div><dt>所属院</dt><dd>{selected.chamber || '該当なし'}</dd></div>
        {selected.roles.length > 0 && <div><dt>役職</dt><dd>{selected.roles.join(' ／ ')}</dd></div>}
        <div><dt>政党・会派</dt><dd>{selected.party || '不明'}</dd></div>
        {selected.person.district && <div><dt>選挙区</dt><dd>{selected.person.district}</dd></div>}
        {selected.person.terms !== undefined && <div><dt>当選回数</dt><dd>{selected.person.terms}回</dd></div>}
        {selected.person.nextElectionYear && <div><dt>次の改選年</dt><dd>{selected.person.nextElectionYear}年</dd></div>}
      </dl>
    </dialog>}
  </section>;
}
