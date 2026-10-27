import { useEffect, useMemo, useState } from 'react';
import { loadPersonsForTarget, type Target } from './data';
import { buildCardGroups, getCardBodyLines, paginateCards, preparePrintSheets, PRINT_OPTIONS, type CardRoster, type PrintTarget } from './printCards';
import './PrintCardsView.css';

type Props = { onBack: () => void };
const SOURCES: Target[] = ['senators', 'councilorsOfficersList', 'ministers', 'viceMinisters', 'parliamentarySecretaries'];

export default function PrintCardsView({ onBack }: Props) {
  const [rosters, setRosters] = useState<CardRoster>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  const [selected, setSelected] = useState<PrintTarget[]>(PRINT_OPTIONS.map(option => option.target));
  const [allCouncilors, setAllCouncilors] = useState(true);
  const [duplex, setDuplex] = useState(true);
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const [imageAttempt, setImageAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const base = import.meta.env.BASE_URL || '/';
    Promise.all(SOURCES.map(async target => [target, await loadPersonsForTarget(base, target, 'basic')] as const))
      .then(entries => { if (!cancelled) setRosters(Object.fromEntries(entries)); })
      .catch(() => { if (!cancelled) setError('名簿を取得できませんでした。通信を確認して再試行してください。'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [reload]);
  const groups = useMemo(() => buildCardGroups(rosters, selected, allCouncilors), [rosters, selected, allCouncilors]);
  const pages = useMemo(() => paginateCards(groups), [groups]);
  const sheets = useMemo(() => preparePrintSheets(pages, duplex), [pages, duplex]);
  const cards = useMemo(() => groups.flatMap(group => group.cards), [groups]);
  const images = useMemo(() => new Set(cards.map(card => card.image).filter(Boolean)), [cards]);
  const ready = [...images].filter(image => loadedImages.has(image)).length;
  const failed = [...images].filter(image => failedImages.has(image)).length + cards.filter(card => !card.image).length;
  const canPrint = !loading && !error && cards.length > 0 && ready === images.size && failed === 0;
  const councilors = useMemo(() => new Set((rosters.senators || []).map(person => person.name.replace(/\s/gu, ''))), [rosters]);
  const coveredCouncilors = new Set(cards.filter(card => councilors.has(card.name.replace(/\s/gu, ''))).map(card => card.name.replace(/\s/gu, ''))).size;
  const date = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const toggle = (target: PrintTarget) => setSelected(previous => previous.includes(target) ? previous.filter(item => item !== target) : [...previous, target]);
  return (
    <div className="print-cards-view">
      <div className="print-cards-controls">
        <button type="button" onClick={onBack}>タイトルへ戻る</button>
        <h1>暗記カードを印刷</h1>
        <p>A4縦に20人（4列×5段）。カード間の余白なしで、境界線に沿って切れます。両面用は表が顔写真、裏が名前・ふりがな・役職などの情報です。</p>
        <label className="print-cards-duplex"><input type="checkbox" checked={duplex} onChange={event => setDuplex(event.target.checked)} />両面印刷用（表：写真／裏：名前・情報）</label>
        <fieldset><legend>印刷する区分</legend>{PRINT_OPTIONS.map(option => (
          <label key={option.target}><input type="checkbox" checked={selected.includes(option.target)} onChange={() => toggle(option.target)} />{option.label}</label>
        ))}</fieldset>
        <p className="print-cards-hint">参議院一般議員は、大臣・副大臣・政務官・参院役員を除いた区分です。</p>
        <label className="print-cards-complete"><input type="checkbox" checked={allCouncilors} disabled={!selected.includes('senators')} onChange={event => setAllCouncilors(event.target.checked)} />参議院の現職全員を含める（大臣等も追加）</label>
        {loading ? <p role="status">最新の名簿を読み込み中…</p> : <p role="status">{cards.length}人・{pages.length}枚{duplex ? `（両面${sheets.length}ページ）` : "（片面）"}{selected.includes('senators') ? ` ／ 参院 ${coveredCouncilors}/${councilors.size}人を収録` : ''}</p>}
        {!loading && cards.length > 0 && <p role="status">写真 {ready}/{images.size}枚 読込済み{failed > 0 ? `（取得できない写真 ${failed}件）` : ''}</p>}
        {error && <p role="alert">{error}</p>}
        <div className="print-cards-actions">
          <button type="button" className="print-cards-primary" disabled={!canPrint} onClick={() => window.print()}>PDFに保存／印刷</button>
          {error && <button type="button" onClick={() => { setLoading(true); setError(''); setReload(value => value + 1); }}>名簿を再読込</button>}
          {failed > 0 && <button type="button" onClick={() => { setFailedImages(new Set()); setImageAttempt(value => value + 1); }}>写真を再読込</button>}
        </div>
        <p className="print-cards-hint">印刷設定：用紙A4・{duplex ? "両面／長辺とじ・" : "片面・"}倍率100%・ヘッダーとフッターはオフ。PDF保存も印刷画面から行えます。</p>
        {!loading && selected.length === 0 && <p>印刷する区分を選んでください。</p>}
      </div>
      <div className="print-cards-preview">
        {sheets.map((page, pageIndex) => (
          <section key={page.key} className={`print-cards-sheet print-sheet-${page.side}`} aria-label={`${page.label} ${page.sectionPage}枚目 ${page.side === "back" ? "裏" : "表"}`}>
            <header><div><strong>{`${page.label}${page.side === 'front' ? '｜表（写真）' : page.side === 'back' ? '｜裏（情報）' : ''}`}</strong>{page.key.startsWith('senators:') && <small>大臣・副大臣・政務官・参院役員を除く</small>}</div><span>{page.total}人・{page.sectionPage}/{page.sectionPages}</span></header>
            <div className="print-cards-grid">{page.cards.map((card, slot) => {
              if (!card) return <div key={`empty:${slot}`} className="print-card-empty" aria-hidden="true" />;
              const lines = getCardBodyLines(card, page.side === 'back' ? 12 : 17);
              const dense = lines.reduce((total, line) => total + Math.ceil([...line].length / 17), 0) > 5;
              return <article key={card.key} className={`print-card${dense ? ' print-card-dense' : ''}${page.side === 'back' ? ' print-card-answer' : ''}`}>
                {page.side !== 'back' && <div className="print-card-photo">{card.image ? <img key={`${card.image}:${imageAttempt}`} src={card.image} alt={card.name} loading="eager" onLoad={() => setLoadedImages(previous => new Set(previous).add(card.image))} onError={() => setFailedImages(previous => new Set(previous).add(card.image))} /> : <span>写真なし</span>}</div>}
                {page.side !== 'front' && <>
                  <h2 style={{ fontSize: `${Math.max(7, Math.min(page.side === 'back' ? 13.5 : 10.2, 115 / [...card.heading].length))}pt` }}>{card.heading}</h2>
                  <div className="print-card-details">{lines.map((line, lineIndex) => <div key={lineIndex}>{line}</div>)}</div>
                </>}
              </article>;
            })}<svg className="print-cards-cut-lines" viewBox="0 0 192 260" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H192V260H0Z M48 0V260 M96 0V260 M144 0V260 M0 52H192 M0 104H192 M0 156H192 M0 208H192" /></svg></div>
            <footer><span>A4・20人／原寸100%{selected.includes('senators') ? `・参院${coveredCouncilors}人収録` : ''}・{date}</span><span>{page.sheetNumber}枚目{page.side === "single" ? "" : page.side === "front" ? " 表" : " 裏"}・{pageIndex + 1}/{sheets.length}</span></footer>
          </section>
        ))}
      </div>
    </div>
  );
}
