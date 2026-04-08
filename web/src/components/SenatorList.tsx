import { useEffect, useMemo, useRef, useState } from "react";
import HelpModal from "./HelpModal";
import { loadMasteredIds, loadWrongIds } from "./progress";
import {
  clearAllPersonNameKanaOverrides,
  clearPersonNameKanaOverride,
  formatDisplayName,
  getPersonNameKanaOverrides,
  loadPersonsForTarget,
  savePersonNameKanaOverride,
  getAvailableTargets,
  getTargetLabels,
  getTargetTabs,
  type AppMode,
  type Person,
  type Target,
} from "./data";
import SafeImage from "./SafeImage";

type Props = {
  appMode: AppMode;
  target: Target;
  onChangeTarget?: (target: Target) => void;
  onBack: () => void;
  focusPersonName?: string;
  focusNonce?: number;
};

type ViewMode = "list" | "compact";
type CompactInfoMode = "role" | "party";

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

function normalizePersonName(value: string): string {
  return value.replace(/[\s\u3000]+/gu, "").trim();
}

function normalizeCompactMetaText(value: string | undefined): string {
  return (value ?? "")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => part !== "衆議院" && part !== "参議院")
    .join(" / ");
}

function shortenCompactRole(value: string | undefined): string {
  const text = normalizeCompactMetaText(value);
  if (!text) return "";

  return text
    .replace(/内閣総理大臣/gu, "総理")
    .replace(/内閣官房長官/gu, "官房長官")
    .replace(/文部科学/gu, "文科")
    .replace(/厚生労働/gu, "厚労")
    .replace(/農林水産/gu, "農水")
    .replace(/経済産業/gu, "経産")
    .replace(/国土交通/gu, "国交")
    .replace(/沖縄及び北方問題に関する/gu, "沖縄北方")
    .replace(/消費者問題に関する/gu, "消費者")
    .replace(/政治倫理の確立及び公職選挙法改正に関する/gu, "政治倫理")
    .replace(/大臣政務官/gu, "政務官")
    .replace(/副大臣/gu, "副大臣")
    .replace(/大臣/gu, "大臣");
}

function getCompactRole(person: Person): string {
  if (person.subRole) return shortenCompactRole(person.subRole);
  if (person.role && person.role !== "副大臣" && person.role !== "大臣政務官" && !person.role.includes("役員")) {
    return shortenCompactRole(person.role);
  }
  return shortenCompactRole(person.group ?? person.role ?? "");
}

function getCompactParty(person: Person): string {
  return person.party ?? person.group ?? "不明";
}

function getCompactBadge(person: Person): string {
  const source = `${person.chamber ?? ""} ${person.group ?? ""}`;
  if (source.includes("衆議院")) return "衆";
  if (source.includes("参議院")) return "参";
  return "";
}

function getCompactBadgeStyle(badge: string): React.CSSProperties {
  if (badge === "参") {
    return {
      ...styles.compactHouseBadge,
      border: "1px solid #1d4ed8",
      background: "#eff6ff",
      color: "#1d4ed8",
    };
  }
  return styles.compactHouseBadge;
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
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [compactInfoMode, setCompactInfoMode] = useState<CompactInfoMode>("role");
  const [showFloatingButtons, setShowFloatingButtons] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editKana, setEditKana] = useState("");
  const [overrideVersion, setOverrideVersion] = useState(0);
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null);
  const itemRefs = useRef<Record<number, HTMLElement | null>>({});

  const baseUrl = import.meta.env.BASE_URL ?? "/";
  const isSenators = props.target === "senators";
  const overrideMap = getPersonNameKanaOverrides(props.target);
  const targetTabs = useMemo(() => getTargetTabs(props.appMode), [props.appMode]);
  const targetLabels = useMemo(() => getTargetLabels(props.appMode), [props.appMode]);
  const availableTargets = useMemo(() => getAvailableTargets(props.appMode), [props.appMode]);
  const isHouseMembersTarget = props.target === "senators" || props.target === "representatives";
  const isMinisterTarget = props.target === "ministers";
  const isMixedTarget =
    props.target === "viceMinisters" ||
    props.target === "parliamentarySecretaries";

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        setItems(await loadPersonsForTarget(baseUrl, props.target, props.appMode));
      } catch (e) {
        console.error(e);
        setItems([]);
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [baseUrl, props.appMode, props.target, overrideVersion]);

  useEffect(() => {
    const onScroll = () => setShowFloatingButtons(window.scrollY > 200);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setEditMode(false);
    setEditingId(null);
    setEditName("");
    setEditKana("");
    setSelectedPerson(null);
  }, [props.target]);

  useEffect(() => {
    if (editMode && viewMode !== "list") {
      setViewMode("list");
    }
  }, [editMode, viewMode]);

  useEffect(() => {
    if (!props.focusPersonName) return;

    const normalizedName = normalizePersonName(props.focusPersonName);
    const found = items.find((person) => normalizePersonName(person.name) === normalizedName);
    if (!found) return;

    setSelectedPerson(found);
    const timer = window.setTimeout(() => {
      itemRefs.current[found.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 60);

    return () => window.clearTimeout(timer);
  }, [items, props.focusNonce, props.focusPersonName]);

  const wrongSet = useMemo(() => new Set(loadWrongIds(props.appMode, props.target)), [props.appMode, props.target]);
  const masteredSet = useMemo(() => new Set(loadMasteredIds(props.appMode, props.target)), [props.appMode, props.target]);

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase();
    if (!key) return items;
    return items.filter((s) => {
      const nextElectionText = s.nextElectionYear ? String(s.nextElectionYear) : "";
      const termsText = typeof s.terms === "number" ? String(s.terms) : "";
      return (
        s.name.toLowerCase().includes(key) ||
        (s.kana ?? "").toLowerCase().includes(key) ||
        (s.party ?? "").toLowerCase().includes(key) ||
        (s.group ?? "").toLowerCase().includes(key) ||
        (s.district ?? "").toLowerCase().includes(key) ||
        termsText.includes(key) ||
        nextElectionText.includes(key)
      );
    });
  }, [items, q]);

  const sorted = useMemo(() => sortItems(filtered, sortKey), [filtered, sortKey]);

  const openEditMode = () => {
    setEditMode(true);
    setEditingId(null);
    setEditName("");
    setEditKana("");
  };

  const closeEditMode = () => {
    setEditMode(false);
    setEditingId(null);
    setEditName("");
    setEditKana("");
  };

  const startEdit = (person: Person) => {
    if (!editMode) return;
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
          <div style={styles.targetSelectWrap}>
            <label htmlFor="list-target-select" style={styles.targetSelectLabel}>区分選択</label>
            <select
              id="list-target-select"
              value={props.target}
              onChange={(e) => props.onChangeTarget?.(e.target.value as Target)}
              style={styles.select}
            >
              {availableTargets.map((target) => (
                <option key={target} value={target}>
                  {targetTabs[target]}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div style={styles.sub}>{targetLabels[props.target]}</div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="名前 / 役職 / 政党 / 選挙区 / 回数 / 改選年で検索"
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
          <div style={styles.actionsButtonGroup}>
            <div style={styles.viewModeGroup}>
              <button
                type="button"
                style={viewMode === "list" ? styles.viewModeActiveBtn : styles.viewModeBtn}
                onClick={() => setViewMode("list")}
              >
                通常
              </button>
              <button
                type="button"
                style={viewMode === "compact" ? styles.viewModeActiveBtn : styles.viewModeBtn}
                onClick={() => setViewMode("compact")}
                disabled={editMode}
              >
                小アイコン
              </button>
              {viewMode === "compact" && !editMode && isMixedTarget ? (
                <>
                  <button
                    type="button"
                    style={compactInfoMode === "role" ? styles.viewModeActiveBtn : styles.viewModeBtn}
                    onClick={() => setCompactInfoMode("role")}
                  >
                    役職
                  </button>
                  <button
                    type="button"
                    style={compactInfoMode === "party" ? styles.viewModeActiveBtn : styles.viewModeBtn}
                    onClick={() => setCompactInfoMode("party")}
                  >
                    政党
                  </button>
                </>
              ) : null}
            </div>
            {editMode ? (
              <button type="button" style={styles.editModeActiveBtn} onClick={closeEditMode}>編集モード終了</button>
            ) : (
              <button type="button" style={styles.editModeBtn} onClick={openEditMode}>編集モード</button>
            )}
            <button type="button" style={hasAnyOverrides ? styles.resetAllBtn : styles.resetAllBtnDisabled} onClick={resetAll} disabled={!hasAnyOverrides}>
              この一覧の編集を全部デフォルトに戻す
            </button>
          </div>
        </div>
        {error ? <div style={{ ...styles.sub, color: "#cf222e" }}>{error}</div> : null}
      </div>

      <div style={viewMode === "compact" ? styles.compactList : styles.list}>
        {sorted.map((s) => {
          const isEditing = editMode && editingId === s.id;
          const hasOverride = Boolean(overrideMap[s.id]?.name || overrideMap[s.id]?.kana);
          return viewMode === "compact" && !editMode ? (
            <button
              key={s.id}
              type="button"
              ref={(node) => {
                itemRefs.current[s.id] = node as HTMLElement | null;
              }}
              style={{
                ...styles.compactItem,
                ...(selectedPerson?.id === s.id ? styles.compactItemFocused : null),
              }}
              onClick={() => setSelectedPerson(s)}
            >
              {(isMixedTarget || props.target === "ministers") && getCompactBadge(s) ? <div style={getCompactBadgeStyle(getCompactBadge(s))}>{getCompactBadge(s)}</div> : null}
              <div style={styles.compactAvatarBox}>
                <SafeImage
                  src={s.images?.[0] ?? ""}
                  alt={formatDisplayName(s, props.target, props.appMode, sorted)}
                  style={styles.compactAvatar}
                  fallbackStyle={styles.compactNoAvatar}
                  fallbackText="画像なし"
                />
              </div>
              <div style={styles.compactName}>{formatDisplayName(s, props.target, props.appMode, sorted)}</div>
              <div style={styles.compactMeta}>
                {isHouseMembersTarget
                  ? getCompactParty(s)
                  : isMinisterTarget
                    ? getCompactRole(s)
                    : isMixedTarget
                      ? (compactInfoMode === "role" ? getCompactRole(s) : getCompactParty(s))
                      : getCompactRole(s)}
              </div>
              <div style={styles.compactBadges}>
                {hasOverride ? <span style={styles.badgeEdit}>編集済み</span> : null}
                {s.aiGuess ? <span style={styles.badgeGuess}>推定</span> : null}
                {masteredSet.has(s.id) ? <span style={styles.badgeOk}>完全</span> : null}
                {wrongSet.has(s.id) ? <span style={styles.badgeNg}>復習</span> : null}
              </div>
            </button>
          ) : (
            <div
              key={s.id}
              ref={(node) => {
                itemRefs.current[s.id] = node;
              }}
              style={{ ...styles.item, ...(selectedPerson?.id === s.id ? styles.itemFocused : null), ...(editMode ? null : styles.itemClickable) }}
              onClick={() => {
                if (editMode) return;
                setSelectedPerson(s);
              }}
            >
              <div style={styles.avatarBox}>
                <SafeImage src={s.images?.[0] ?? ""} alt={formatDisplayName(s, props.target, props.appMode, sorted)} style={styles.avatar} fallbackStyle={styles.noAvatar} fallbackText="画像なし" />
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
                      <div style={styles.name}>{formatDisplayName(s, props.target, props.appMode, sorted)}</div>
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

                {editMode || hasOverride ? (
                  <div style={styles.editButtons}>
                    {isEditing ? (
                      <>
                        <button type="button" style={styles.saveBtn} onClick={() => saveEdit(s)}>保存</button>
                        <button type="button" style={styles.smallBtn} onClick={cancelEdit}>取消</button>
                      </>
                    ) : editMode ? (
                      <button type="button" style={styles.smallBtn} onClick={() => startEdit(s)}>この議員を編集</button>
                    ) : null}
                    <button type="button" style={hasOverride ? styles.resetBtn : styles.resetBtnDisabled} onClick={() => resetPerson(s)} disabled={!hasOverride}>
                      デフォルトに戻す
                    </button>
                  </div>
                ) : null}

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

      <HelpModal open={selectedPerson !== null} onClose={() => setSelectedPerson(null)} title={selectedPerson?.name ?? "詳細"}>
        {selectedPerson ? (
          <div style={styles.detailWrap}>
            <div style={styles.detailImageBox}>
              <SafeImage
                src={selectedPerson.images?.[0] ?? ""}
                alt={selectedPerson.name}
                style={styles.detailImage}
                fallbackStyle={styles.detailNoImage}
                fallbackText="画像なし"
              />
            </div>
            <div style={styles.detailName}>{selectedPerson.name}</div>
            {selectedPerson.kana ? <div style={styles.detailKana}>{selectedPerson.kana}</div> : null}
            <div style={styles.detailGrid}>
              <div style={styles.detailLine}>役職・所属：{selectedPerson.group ?? selectedPerson.party ?? "不明"}</div>
              <div style={styles.detailLine}>政党：{selectedPerson.party ?? selectedPerson.group ?? "不明"}</div>
              <div style={styles.detailLine}>選挙区：{selectedPerson.district ?? "不明"}</div>
              <div style={styles.detailLine}>当選回数：{typeof selectedPerson.terms === "number" ? `${selectedPerson.terms}回` : "不明"}</div>
              <div style={styles.detailLine}>次の改選年：{selectedPerson.nextElectionYear ? `${selectedPerson.nextElectionYear}年` : "不明"}</div>
            </div>
          </div>
        ) : null}
      </HelpModal>

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
  targetSelectWrap: { width: "100%", display: "flex", flexDirection: "column", gap: 6 },
  targetSelectLabel: { fontSize: 14, fontWeight: 700, color: "#333" },
  search: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16 },
  select: { width: "100%", padding: "12px 12px", borderRadius: 10, border: "1px solid #999", fontSize: 16, background: "#fff" },
  sub: { fontSize: 13, color: "#444" },
  actionsRow: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" },
  actionsButtonGroup: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  viewModeGroup: { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  viewModeBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #999", background: "#fff", fontWeight: 700 },
  viewModeActiveBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#0969da", color: "#fff", fontWeight: 800 },
  editModeBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #0969da", background: "#eef6ff", color: "#0969da", fontWeight: 800 },
  editModeActiveBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #111", background: "#111", color: "#fff", fontWeight: 800 },
  resetAllBtn: { padding: "10px 12px", borderRadius: 10, border: "1px solid #cf222e", background: "#fff0f0", fontWeight: 700 },
  resetAllBtnDisabled: { padding: "10px 12px", borderRadius: 10, border: "1px solid #ddd", background: "#f6f6f6", color: "#999", fontWeight: 700 },
  list: { width: "min(820px, 100%)", display: "flex", flexDirection: "column", gap: 10 },
  compactList: { width: "min(820px, 100%)", display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10 },
  item: { display: "flex", gap: 14, border: "1px solid #ddd", borderRadius: 12, padding: 12, alignItems: "center" },
  itemClickable: { cursor: "pointer" },
  itemFocused: { border: "2px solid #0969da", background: "#eff6ff" },
  compactItem: { position: "relative", display: "flex", flexDirection: "column", gap: 6, border: "1px solid #ddd", borderRadius: 12, padding: 10, background: "#fff", textAlign: "left" },
  compactItemFocused: { border: "2px solid #0969da", background: "#eff6ff" },
  compactAvatarBox: { width: "100%", aspectRatio: "3 / 4", borderRadius: 10, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" },
  compactAvatar: { width: "100%", height: "100%", objectFit: "cover" },
  compactNoAvatar: { fontSize: 12, color: "#777" },
  compactName: { fontSize: 14, fontWeight: 800, lineHeight: 1.35, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
  compactMeta: { fontSize: 11, color: "#666", lineHeight: 1.3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: 15 },
  compactHouseBadge: { position: "absolute", top: 8, right: 8, fontSize: 11, fontWeight: 800, padding: "2px 6px", borderRadius: 999, border: "1px solid #999", background: "#fff", color: "#444", zIndex: 1 },
  compactBadges: { display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" },
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
  detailWrap: { display: "flex", flexDirection: "column", gap: 12 },
  detailImageBox: { width: "100%", aspectRatio: "3 / 4", borderRadius: 14, overflow: "hidden", background: "#f3f3f3", display: "flex", alignItems: "center", justifyContent: "center" },
  detailImage: { width: "100%", height: "100%", objectFit: "cover" },
  detailNoImage: { fontSize: 14, color: "#777" },
  detailName: { fontSize: 24, fontWeight: 800 },
  detailKana: { fontSize: 15, color: "#666" },
  detailGrid: { display: "flex", flexDirection: "column", gap: 8 },
  detailLine: { fontSize: 14, color: "#333" },
};
