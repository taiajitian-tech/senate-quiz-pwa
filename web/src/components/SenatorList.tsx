import { useEffect, useMemo, useState } from "react";
import HelpModal from "./HelpModal";
import { loadMasteredIds, loadWrongIds } from "./progress";
import {
  clearAllPersonNameKanaOverrides,
  clearPersonNameKanaOverride,
  getPersonNameKanaOverrides,
  parsePersonsJson,
  savePersonNameKanaOverride,
  targetDataPath,
  targetLabels,
  targetTabs,
  type Person,
  type Target,
} from "./data";
import SafeImage from "./SafeImage";

type Props = {
  target: Target;
  onChangeTarget?: (target: Target) => void;
  onBack: () => void;
};

type SortKey =
  | "name_asc"
  | "name_desc"
  | "district_geo"
  | "terms_asc"
  | "terms_desc"
  | "year_asc"
  | "year_desc";

const JA_COLLATOR = new Intl.Collator("ja");

const PREFECTURE_ORDER = [
  "北海道", "青森", "岩手", "宮城", "秋田", "山形", "福島", "茨城", "栃木", "群馬", "埼玉", "千葉", "東京", "神奈川",
  "新潟", "富山", "石川", "福井", "山梨", "長野", "岐阜", "静岡", "愛知", "三重", "滋賀", "京都", "大阪", "兵庫",
  "奈良", "和歌山", "鳥取", "島根", "岡山", "広島", "山口", "徳島", "香川", "愛媛", "高知", "福岡", "佐賀", "長崎",
  "熊本", "大分", "宮崎", "鹿児島", "沖縄",
] as const;

const PREFECTURE_ORDER_MAP = new Map(PREFECTURE_ORDER.map((name, index) => [name, index]));

function sortText(value: string | undefined): string {
  return value?.trim() ?? "";
}

function normalizeDistrictText(value: string | undefined): string {
  return sortText(value)
    .replace(/^選挙区\s*[：:：]?\s*/u, "")
    .replace(/[（(]([^）)]+)[）)]/gu, "$1")
    .replace(/選挙区/gu, "")
    .trim();
}

function getDistrictGeoRank(value: string | undefined): number {
  const text = normalizeDistrictText(value);
  if (!text) return 9998;
  if (text.includes("比例")) return 9999;

  for (const prefecture of PREFECTURE_ORDER) {
    if (text.includes(prefecture)) {
      return PREFECTURE_ORDER_MAP.get(prefecture) ?? 9998;
    }
  }

  return 9998;
}

function getNameSortText(person: Person): string {
  return (person.kana || person.name || "").trim();
}

function compareName(a: Person, b: Person): number {
  const byKana = JA_COLLATOR.compare(getNameSortText(a), getNameSortText(b));
  if (byKana !== 0) return byKana;
  return JA_COLLATOR.compare(a.name, b.name);
}

function compareDistrictGeo(a: Person, b: Person): number {
  const rankDiff = getDistrictGeoRank(a.district) - getDistrictGeoRank(b.district);
  if (rankDiff !== 0) return rankDiff;
  const diff = JA_COLLATOR.compare(normalizeDistrictText(a.district), normalizeDistrictText(b.district));
  return diff !== 0 ? diff : compareName(a, b);
}

function compareTerms(a: Person, b: Person, desc = false): number {
  const missingRankA = typeof a.terms === "number" ? 0 : 1;
  const missingRankB = typeof b.terms === "number" ? 0 : 1;
  if (missingRankA !== missingRankB) return missingRankA - missingRankB;
  const av = a.terms ?? -1;
  const bv = b.terms ?? -1;
  const diff = desc ? bv - av : av - bv;
  return diff !== 0 ? diff : compareName(a, b);
}

function compareYear(a: Person, b: Person, desc = false): number {
  const missingRankA = typeof a.nextElectionYear === "number" ? 0 : 1;
  const missingRankB = typeof b.nextElectionYear === "number" ? 0 : 1;
  if (missingRankA !== missingRankB) return missingRankA - missingRankB;
  const av = a.nextElectionYear ?? -1;
  const bv = b.nextElectionYear ?? -1;
  const diff = desc ? bv - av : av - bv;
  return diff !== 0 ? diff : compareName(a, b);
}

function sortItems(items: Person[], sortKey: SortKey): Person[] {
  return [...items].sort((a, b) => {
    switch (sortKey) {
      case "name_asc":
        return compareName(a, b);
      case "name_desc":
        return compareName(b, a);
      case "district_geo":
        return compareDistrictGeo(a, b);
      case "terms_asc":
        return compareTerms(a, b, false);
      case "terms_desc":
        return compareTerms(a, b, true);
      case "year_asc":
        return compareYear(a, b, false);
      case "year_desc":
        return compareYear(a, b, true);
      default:
        return 0;
    }
  });
}

export default function SenatorList(props: Props) {
  const [items, setItems] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("name_asc");
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editKana, setEditKana] = useState("");
  const [overrideVersion, setOverrideVersion] = useState(0);

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const dataUrl = `${baseUrl}${targetDataPath[props.target]}`;
  const isSenators = props.target === "senators";
  const searchPlaceholder = isSenators
    ? "名前 / 政党 / 選挙区 / 回数 / 改選年で検索"
    : "名前 / フリガナ / 役職 / 会派で検索";
  const overrideMap = useMemo(() => getPersonNameKanaOverrides(props.target), [props.target, overrideVersion]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(dataUrl, { cache: "no-store" });
        if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
        const json = (await res.json()) as unknown;
        setItems(parsePersonsJson(json, props.target));
      } catch (e) {
        console.error(e);
        setItems([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dataUrl, props.target, overrideVersion]);

  useEffect(() => {
    const onScroll = () => setShowFloatingButtons(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setEditingId(null);
    setEditName("");
    setEditKana("");
  }, [props.target]);

  const wrongSet = useMemo(() => new Set(loadWrongIds(props.target)), [props.target]);
  const masteredSet = useMemo(() => new Set(loadMasteredIds(props.target)), [props.target]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return items;
    return items.filter((s) => {
      const nextElectionText = s.nextElectionYear ? String(s.nextElectionYear) : "";
      const termsText = typeof s.terms === "number" ? String(s.terms) : "";
      return (
        s.name.toLowerCase().includes(key) ||
        (s.kana ?? "").toLowerCase().includes(key) ||
        (s.party ?? s.group ?? "").toLowerCase().includes(key) ||
        (s.district ?? "").toLowerCase().includes(key) ||
        termsText.includes(key) ||
        nextElectionText.includes(key)
      );
    });
  }, [q, items]);

  const sorted = useMemo(() => sortItems(filtered, sortKey), [filtered, sortKey]);

  const startEdit = (person: Person) => {
    setEditingId(person.id);
    setEditName(person.name);
    setEditKana(person.kana ?? "");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName("");
    setEditKana("");
  };

  const saveEdit = (person: Person) => {
    savePersonNameKanaOverride(props.target, person.id, { name: editName, kana: editKana });
    setOverrideVersion((value) => value + 1);
    cancelEdit();
  };

  const resetPerson = (person: Person) => {
    clearPersonNameKanaOverride(props.target, person.id);
    setOverrideVersion((value) => value + 1);
    if (editingId === person.id) cancelEdit();
  };

  const resetAll = () => {
    clearAllPersonNameKanaOverrides(props.target);
    setOverrideVersion((value) => value + 1);
    cancelEdit();
  };

  const hasAnyOverrides = Object.keys(overrideMap).length > 0;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <button type="button" style={styles.backBtn} onClick={props.onBack}>タイトルへ戻る</button>
        <div style={styles.headerRow}>
          <div style={styles.h1}>一覧</div>
          <button type="button" style={styles.helpBtn} onClick={() => setHelpOpen(true)}>？</button>
        </div>
        {props.onChangeTarget ? (
          <div style={styles.segment}>
            {(Object.keys(targetTabs) as Target[]).map((target) => (
              <button
                key={target}
                type="button"
                style={props.target === target ? styles.segmentActive : styles.segmentBtn}
                onClick={() => props.onChangeTarget?.(target)}
              >
                {targetTabs[target]}
              </button>
            ))}
          </div>
        ) : null}
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          style={styles.search}
        />
        <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} style={styles.select}>
          <option value="name_asc">名前（昇順）</option>
          <option value="name_desc">名前（降順）</option>
          {isSenators ? <option value="district_geo">選挙区</option> : null}
          {isSenators ? <option value="terms_asc">当選回数（昇順）</option> : null}
          {isSenators ? <option value="terms_desc">当選回数（降順）</option> : null}
          {isSenators ? <option value="year_asc">次の改選年（昇順）</option> : null}
          {isSenators ? <option value="year_desc">次の改選年（降順）</option> : null}
        </select>
        <div style={styles.actionsRow}>
          <div style={styles.sub}>{loading ? "読み込み中" : `表示：${sorted.length} / ${items.length}`}</div>
          <button type="button" style={hasAnyOverrides ? styles.resetAllBtn : styles.resetAllBtnDisabled} onClick={resetAll} disabled={!hasAnyOverrides}>
            この一覧の編集を全部デフォルトに戻す
          </button>
        </div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={styles.list}>
        {sorted.map((s) => {
          const isEditing = editingId === s.id;
          const hasOverride = Boolean(overrideMap[s.id]?.name || overrideMap[s.id]?.kana);
          return (
            <div key={s.id} style={styles.item}>
              <div style={styles.avatarBox}>
                <SafeImage src={s.images?.[0] ?? ""} alt={s.name} style={styles.avatar} fallbackStyle={styles.noAvatar} fallbackText="画像なし" />
              </div>
              <div style={styles.meta}>
                {isEditing ? (
                  <>
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="議員名" style={styles.editInput} />
                    <input value={editKana} onChange={(e) => setEditKana(e.target.value)} placeholder="フリガナ" style={styles.editInput} />
                  </>
                ) : (
                  <>
                    <div style={styles.nameRow}>
                      <div style={styles.name}>{s.name}</div>
                      <div style={styles.badges}>
                        {hasOverride ? <span style={styles.badgeEdit}>編集済み</span> : null}
                        {s.aiGuess ? <span style={styles.badgeGuess}>推定</span> : null}
                        {masteredSet.has(s.id) ? <span style={styles.badgeOk}>完全</span> : null}
                        {wrongSet.has(s.id) ? <span style={styles.badgeNg}>復習</span> : null}
                      </div>
                    </div>
                    {s.kana ? <div style={styles.kana}>{s.kana}</div> : null}
                  </>
                )}

                <div style={styles.editButtons}>
                  {isEditing ? (
                    <>
                      <button type="button" style={styles.saveBtn} onClick={() => saveEdit(s)}>保存</button>
                      <button type="button" style={styles.smallBtn} onClick={cancelEdit}>取消</button>
                    </>
                  ) : (
                    <button type="button" style={styles.smallBtn} onClick={() => startEdit(s)}>編集</button>
                  )}
                  <button type="button" style={hasOverride ? styles.resetBtn : styles.resetBtnDisabled} onClick={() => resetPerson(s)} disabled={!hasOverride}>
                    デフォルトに戻す
                  </button>
                </div>

                {isSenators ? (
                  <div style={styles.infoGrid}>
                    <div style={styles.infoLine}>政党：{s.party ?? s.group ?? "不明"}</div>
                    <div style={styles.infoLine}>選挙区：{s.district ?? "不明"}</div>
                    <div style={styles.infoLine}>当選回数：{typeof s.terms === "number" ? `${s.terms}回` : "不明"}</div>
                    <div style={styles.infoLine}>次の改選年：{s.nextElectionYear ? `${s.nextElectionYear}年` : "不明"}</div>
                  </div>
                ) : (
                  <div style={styles.group}>{s.group ?? ""}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {showFloatingButtons ? (
        <div style={styles.floatingButtons}>
          <button type="button" style={styles.floatingBackButton} onClick={props.onBack}>戻る</button>
          <button
            type="button"
            style={styles.scrollTopButton}
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="一番上に戻る"
            title="一番上に戻る"
          >
            ↑
          </button>
        </div>
      ) : null}

      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} title="ヘルプ（一覧）">
        <p>議員名とフリガナだけをこの端末で編集できます。デフォルトに戻すと元の表示に戻ります。</p>
      </HelpModal>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrap: { minHeight: "100vh", padding: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "center" },
  header: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 8 },
  headerRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 },
  backBtn: { alignSelf: "flex-start", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff" },
  helpBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 800, width: 44 },
  h1: { fontSize: 22, fontWeight: 800 },
  segment: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 },
  segmentBtn: { padding: "12px 10px", borderRadius: 12, border: "1px solid #bbb", background: "#fff", fontWeight: 700 },
  segmentActive: { padding: "12px 10px", borderRadius: 12, border: "1px solid #111", background: "#111", color: "#fff", fontWeight: 800 },
  search: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
  select: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16, background: "#fff" },
  sub: { fontSize: 13, color: "#444" },
  actionsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  resetAllBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 700 },
  resetAllBtnDisabled: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#f6f6f6", color: "#999", fontWeight: 700 },
  list: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 10 },
  item: { display: "flex", gap: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12, alignItems: "center" },
  avatarBox: { width: 96, height: 96, borderRadius: 12, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center", flex: "0 0 96px" },
  avatar: { width: "100%", height: "100%", objectFit: "cover" },
  noAvatar: { fontSize: 12, color: "#777" },
  meta: { flex: 1, display: "flex", flexDirection: "column", gap: 6 },
  nameRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 },
  name: { fontSize: 18, fontWeight: 800 },
  kana: { fontSize: 14, color: "#666" },
  group: { fontSize: 15, color: "#444" },
  infoGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 6 },
  infoLine: { fontSize: 14, color: "#444" },
  badges: { display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" },
  badgeOk: { padding: "4px 8px", borderRadius: 999, border: "1px solid #1a7f37", background: "#eafff0", fontSize: 12, fontWeight: 800 },
  badgeNg: { padding: "4px 8px", borderRadius: 999, border: "1px solid #cf222e", background: "#fff0f0", fontSize: 12, fontWeight: 800 },
  badgeGuess: { padding: "4px 8px", borderRadius: 999, border: "1px solid #6b7280", background: "#f3f4f6", fontSize: 12, fontWeight: 800, color: "#374151" },
  badgeEdit: { padding: "4px 8px", borderRadius: 999, border: "1px solid #1d4ed8", background: "#eff6ff", fontSize: 12, fontWeight: 800, color: "#1d4ed8" },
  editInput: { width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
  editButtons: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  smallBtn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 700 },
  saveBtn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #1d4ed8", background: "#eff6ff", color: "#1d4ed8", fontWeight: 800 },
  resetBtn: { padding: "8px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 700 },
  resetBtnDisabled: { padding: "8px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#f6f6f6", color: "#999", fontWeight: 700 },
  floatingButtons: { position: "fixed", right: 20, bottom: 20, zIndex: 1000, display: "flex", flexDirection: "column", gap: 10, alignItems: "flex-end" },
  floatingBackButton: { padding: "10px 14px", borderRadius: 10, border: "1px solid #999", background: "#fff", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)", fontWeight: 700 },
  scrollTopButton: { width: 46, height: 46, borderRadius: 999, border: "1px solid #999", background: "#fff", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)", fontSize: 22, fontWeight: 800, lineHeight: 1 },
};
