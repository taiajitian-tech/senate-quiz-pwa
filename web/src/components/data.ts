export type AppMode = "basic" | "entrance";

export type Target = "senators" | "representatives" | "ministers" | "viceMinisters" | "parliamentarySecretaries" | "councilorsOfficersList" | "houseOfficersList";

export type Person = {
  id: number;
  name: string;
  kana?: string;
  group?: string;
  party?: string;
  district?: string;
  role?: string;
  subRole?: string;
  chamber?: string;
  terms?: number;
  nextElectionYear?: number;
  images: string[];
  aiGuess?: boolean;
};

const BASIC_TARGET_LABELS: Record<Target, string> = {
  senators: "現職参議院議員",
  representatives: "現職衆議院議員",
  ministers: "現職大臣",
  viceMinisters: "副大臣",
  parliamentarySecretaries: "大臣政務官",
  councilorsOfficersList: "参議院役員一覧",
  houseOfficersList: "衆議院役員一覧",
};

const BASIC_TARGET_TABS: Record<Target, string> = {
  senators: "参議院",
  representatives: "衆議院",
  ministers: "現職大臣",
  viceMinisters: "副大臣",
  parliamentarySecretaries: "大臣政務官",
  councilorsOfficersList: "参議院役員一覧",
  houseOfficersList: "衆議院役員一覧",
};

const ENTRANCE_TARGETS: Target[] = [
  "senators",
  "councilorsOfficersList",
  "ministers",
  "viceMinisters",
  "parliamentarySecretaries",
  "representatives",
];

const ENTRANCE_TARGET_LABELS: Record<Target, string> = {
  senators: "参議院一般議員",
  representatives: "衆議院議員",
  ministers: "大臣",
  viceMinisters: "副大臣",
  parliamentarySecretaries: "衆議院政務官",
  councilorsOfficersList: "参議院役員",
  houseOfficersList: "衆議院役員一覧",
};

const ENTRANCE_TARGET_TABS: Record<Target, string> = {
  senators: "参議院一般議員",
  representatives: "衆議院議員",
  ministers: "大臣",
  viceMinisters: "副大臣",
  parliamentarySecretaries: "衆議院政務官",
  councilorsOfficersList: "参議院役員",
  houseOfficersList: "衆議院役員一覧",
};

export const targetLabels = BASIC_TARGET_LABELS;
export const targetTabs = BASIC_TARGET_TABS;

export function getTargetLabels(mode: AppMode): Record<Target, string> {
  return mode === "entrance" ? ENTRANCE_TARGET_LABELS : BASIC_TARGET_LABELS;
}

export function getTargetTabs(mode: AppMode): Record<Target, string> {
  return mode === "entrance" ? ENTRANCE_TARGET_TABS : BASIC_TARGET_TABS;
}

export function getAvailableTargets(mode: AppMode): Target[] {
  return mode === "entrance"
    ? ENTRANCE_TARGETS
    : (["senators", "representatives", "ministers", "viceMinisters", "parliamentarySecretaries", "councilorsOfficersList", "houseOfficersList"] as Target[]);
}

export const targetDataPath: Record<Target, string> = {
  senators: "data/senators.json",
  representatives: "data/representatives.json",
  ministers: "data/ministers.json",
  viceMinisters: "data/vice-ministers.json",
  parliamentarySecretaries: "data/parliamentary-secretaries.json",
  councilorsOfficersList: "data/councilors-officers.json",
  houseOfficersList: "data/house-officers.json",
};

type RawPerson = Record<string, unknown>;

const BAD_GUESS_IMAGE_NAMES = new Set(["浅田眞澄美"]);

const MINISTER_KANA_MAP: Record<string, string> = {
  "高市早苗": "たかいちさなえ",
  "林芳正": "はやしよしまさ",
  "平口洋": "ひらぐちひろし",
  "茂木敏充": "もてぎとしみつ",
  "片山さつき": "かたやまさつき",
  "松本洋平": "まつもとようへい",
  "上野賢一郎": "うえのけんいちろう",
  "鈴木憲和": "すずきのりかず",
  "赤澤亮正": "あかざわりょうせい",
  "金子恭之": "かねこやすし",
  "石原宏高": "いしはらひろたか",
  "小泉進次郎": "こいずみしんじろう",
  "木原稔": "きはらみのる",
  "松本尚": "まつもとひさし",
  "牧野たかお": "まきのたかお",
  "あかま二郎": "あかまじろう",
  "黄川田仁志": "きかわだひとし",
  "城内実": "きうちみのる",
  "小野田紀美": "おのだきみ",
  "尾﨑正直": "おざきまさなお",
  "佐藤啓": "さとうけい",
  "露木康浩": "つゆきやすひろ",
  "岩尾信行": "いわおのぶゆき",
};

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toImages(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((img): img is string => typeof img === "string").map((img) => img.trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const img = value.trim();
    return img ? [img] : [];
  }
  return [];
}

function normalizeCompact(value: string): string {
  return value.replace(/[\s\u3000]+/g, "").trim();
}

function splitNameAndKana(rawName: string) {
  const text = rawName.trim();
  const match = text.match(/^(.*?)（([^）]+)）$/u) ?? text.match(/^(.*?)\(([^)]+)\)$/u);
  if (!match) {
    return { name: text, kana: "" };
  }
  return {
    name: match[1].trim(),
    kana: normalizeCompact(match[2]),
  };
}

function deriveKana(v: RawPerson, cleanName: string, parsedKana: string): string {
  const explicit = normalizeCompact(toText(v.kana) || toText(v.nameKana) || toText(v.kanaName));
  if (explicit) return explicit;
  if (parsedKana) return parsedKana;
  return MINISTER_KANA_MAP[normalizeCompact(cleanName)] ?? "";
}

export function formatNameWithKana(person: Pick<Person, "name" | "kana">): string {
  return person.kana ? `${person.name}（${person.kana}）` : person.name;
}


const DISPLAY_SURNAME_OVERRIDES: Record<string, string> = {
  "今枝宗一郎": "今枝",
  "田所嘉徳": "田所",
  "瀬戸隆一": "瀬戸",
  "岩田和親": "岩田",
  "鈴木隼人": "鈴木",
  "津島淳": "津島",
  "堀内詔子": "堀内",
  "高橋克法": "高橋",
  "高橋 克法": "高橋",
  "三谷英弘": "三谷",
  "国光あやの": "国光",
  "堀井巌": "堀井",
  "中谷真一": "中谷",
  "舞立昇治": "舞立",
  "小林茂樹": "小林",
  "中村裕之": "中村",
  "長坂康正": "長坂",
  "仁木博文": "仁木",
  "根本幸典": "根本",
  "山下雄平": "山下",
  "山下 雄平": "山下",
  "井野俊郎": "井野",
  "山田賢司": "山田",
  "佐々木紀": "佐々木",
  "酒井庸行": "酒井",
  "青山繁晴": "青山",
  "辻清人": "辻",
  "宮崎政久": "宮崎",
};

function normalizeDisplayNameText(value: string | undefined): string {
  return (value ?? "").replace(/[\s　]+/gu, " ").trim();
}

function getDisplaySurname(name: string): string | null {
  const normalized = normalizeDisplayNameText(name);
  if (!normalized) return null;
  const override = DISPLAY_SURNAME_OVERRIDES[normalized.replace(/ /gu, "")] ?? DISPLAY_SURNAME_OVERRIDES[normalized];
  if (override) return override;
  const parts = normalized.split(" ").filter(Boolean);
  if (parts.length >= 2) return parts[0];
  return null;
}

function buildSurnameCountMap(items: Person[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const item of items) {
    const surname = getDisplaySurname(item.name);
    if (!surname) continue;
    counts.set(surname, (counts.get(surname) ?? 0) + 1);
  }
  return counts;
}

function getCouncilorsOfficerDisplayName(person: Person, surnameCounts: Map<string, number>): string | null {
  const subRole = normalizeDisplayNameText(person.subRole || person.group || person.role);
  if (!subRole) return null;

  if (subRole.endsWith("委員長") && !subRole.includes("特別")) {
    return subRole;
  }

  const surname = getDisplaySurname(person.name);
  const useFullName = !surname || (surnameCounts.get(surname) ?? 0) > 1;
  const baseName = useFullName ? normalizeDisplayNameText(person.name).replace(/ /gu, "") : surname;

  if (subRole.endsWith("特別委員長")) return `${baseName}特別委員長`;
  if (subRole.endsWith("調査会長")) return `${baseName}調査会長`;
  if (subRole.endsWith("審査会会長")) return `${baseName}審査会長`;
  if (subRole.endsWith("会長")) return `${baseName}${subRole.replace(/^.*?(会長)$/u, "$1")}`;
  return null;
}

function getViceMinisterDisplayName(person: Person, surnameCounts: Map<string, number>): string | null {
  const surname = getDisplaySurname(person.name);
  if (!surname) return null;
  const useFullName = (surnameCounts.get(surname) ?? 0) > 1;
  const baseName = useFullName ? normalizeDisplayNameText(person.name).replace(/ /gu, "") : surname;
  return `${baseName}副大臣`;
}

export function getPersonDisplayName(person: Pick<Person, "name" | "group" | "role" | "subRole">, target: Target, appMode: AppMode, allItems: Person[] = []): string {
  if (appMode !== "entrance") return person.name;

  const surnameCounts = buildSurnameCountMap(allItems);

  if (target === "councilorsOfficersList") {
    return getCouncilorsOfficerDisplayName(person as Person, surnameCounts) ?? person.name;
  }

  if (target === "viceMinisters") {
    return getViceMinisterDisplayName(person as Person, surnameCounts) ?? person.name;
  }

  return person.name;
}

export function formatDisplayName(person: Pick<Person, "name" | "group" | "role" | "subRole">, target: Target, appMode: AppMode, allItems: Person[] = []): string {
  return getPersonDisplayName(person, target, appMode, allItems);
}

export function formatDisplayNameWithKana(person: Pick<Person, "name" | "kana" | "group" | "role" | "subRole">, target: Target, appMode: AppMode, allItems: Person[] = []): string {
  const displayName = getPersonDisplayName(person, target, appMode, allItems);
  if (displayName !== person.name) return displayName;
  return person.kana ? `${person.name}（${person.kana}）` : person.name;
}

export type PersonNameKanaOverride = {
  name?: string;
  kana?: string;
};

const PERSON_NAME_KANA_OVERRIDES_KEY = "person_name_kana_overrides_v1";

type OverrideMap = Record<string, PersonNameKanaOverride>;

function normalizeOverrideText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function getOverrideStorageKey(target: Target, id: number): string {
  return `${target}:${id}`;
}

function readOverrideMap(): OverrideMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(PERSON_NAME_KANA_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as OverrideMap) : {};
  } catch {
    return {};
  }
}

function writeOverrideMap(map: OverrideMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PERSON_NAME_KANA_OVERRIDES_KEY, JSON.stringify(map));
}

export function getPersonNameKanaOverrides(target: Target): Record<number, PersonNameKanaOverride> {
  const map = readOverrideMap();
  const out: Record<number, PersonNameKanaOverride> = {};
  for (const [key, value] of Object.entries(map)) {
    const [storedTarget, rawId] = key.split(":");
    if (storedTarget !== target) continue;
    const id = Number(rawId);
    if (!Number.isFinite(id) || id <= 0) continue;
    out[id] = {
      name: normalizeOverrideText(value?.name),
      kana: normalizeOverrideText(value?.kana),
    };
  }
  return out;
}

export function savePersonNameKanaOverride(target: Target, id: number, value: PersonNameKanaOverride) {
  const map = readOverrideMap();
  const key = getOverrideStorageKey(target, id);
  const nextName = normalizeOverrideText(value.name);
  const nextKana = normalizeOverrideText(value.kana);
  if (!nextName && !nextKana) {
    delete map[key];
  } else {
    map[key] = { name: nextName, kana: nextKana };
  }
  writeOverrideMap(map);
}

export function clearPersonNameKanaOverride(target: Target, id: number) {
  const map = readOverrideMap();
  delete map[getOverrideStorageKey(target, id)];
  writeOverrideMap(map);
}

export function clearAllPersonNameKanaOverrides(target: Target) {
  const map = readOverrideMap();
  for (const key of Object.keys(map)) {
    if (key.startsWith(`${target}:`)) delete map[key];
  }
  writeOverrideMap(map);
}

function applyNameKanaOverride(person: Person, target?: Target): Person {
  if (!target) return person;
  const override = getPersonNameKanaOverrides(target)[person.id];
  if (!override) return person;
  return {
    ...person,
    name: override.name || person.name,
    kana: override.kana || person.kana,
  };
}

function normalizePerson(value: unknown, index: number): Person | null {
  if (!value || typeof value !== "object") return null;
  const v = value as RawPerson;

  const rawName = toText(v.name);
  if (!rawName) return null;

  const rawId = Number(v.id);
  const id = Number.isFinite(rawId) && rawId > 0 ? rawId : index + 1;

  const split = splitNameAndKana(rawName);
  const cleanName = split.name;
  const kana = deriveKana(v, cleanName, split.kana);
  const group = toText(v.group) || toText(v.party) || toText(v.role);
  const party = toText(v.party) || toText(v.group) || toText(v.role);
  const district = toText(v.district) || toText(v.electoralDistrict) || toText(v.constituency);
  const role = toText(v.role) || toText(v.title) || toText(v.post) || toText(v.position);
  const subRole = toText(v.subRole) || toText(v.subrole) || toText(v.detailRole);
  const chamber = toText(v.chamber) || toText(v.house);
  const rawTerms = Number(v.terms ?? v.wins ?? v.electedCount);
  const terms = Number.isFinite(rawTerms) && rawTerms > 0 ? rawTerms : undefined;
  const rawNextElectionYear = Number(v.nextElectionYear ?? v.nextElection ?? v.electionYear);
  const nextElectionYear = Number.isFinite(rawNextElectionYear) && rawNextElectionYear > 0 ? rawNextElectionYear : undefined;
  const images = toImages(v.images ?? v.image);
  const aiGuess = v.aiGuess === true || toText(v.imageSource) === "web-fallback";
  const safeImages = aiGuess && BAD_GUESS_IMAGE_NAMES.has(cleanName) ? [] : images;

  return {
    id,
    name: cleanName,
    kana,
    group,
    party,
    district,
    role,
    subRole,
    chamber,
    terms,
    nextElectionYear,
    images: safeImages,
    aiGuess,
  };
}

function hasName(person: Person, names: Set<string>): boolean {
  return names.has(normalizeCompact(person.name));
}

async function loadRawPersons(baseUrl: string, target: Target): Promise<Person[]> {
  const res = await fetch(`${baseUrl}${targetDataPath[target]}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
  const json = (await res.json()) as unknown;
  if (!Array.isArray(json)) return [];
  return json
    .map((item, index) => normalizePerson(item, index))
    .filter((item): item is Person => item !== null)
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && !!item.name);
}

function filterEntranceMode(items: Person[], target: Target, related: Partial<Record<Target, Person[]>> = {}): Person[] {
  switch (target) {
    case "senators": {
      const officerNames = new Set((related.councilorsOfficersList ?? []).map((item) => normalizeCompact(item.name)));
      return items.filter((item) => !hasName(item, officerNames));
    }
    case "representatives": {
      const excludedNames = new Set<string>();
      for (const sourceTarget of ["ministers", "viceMinisters", "parliamentarySecretaries"] as const) {
        for (const item of related[sourceTarget] ?? []) {
          const text = normalizeCompact([item.group, item.party, item.district].filter(Boolean).join(" / "));
          if (sourceTarget === "parliamentarySecretaries" || sourceTarget === "viceMinisters" || text.includes("衆議院")) {
            excludedNames.add(normalizeCompact(item.name));
          }
        }
      }
      return items.filter((item) => !hasName(item, excludedNames));
    }
    case "parliamentarySecretaries":
      return items.filter((item) => normalizeCompact([item.group, item.party].filter(Boolean).join(" / ")).includes("衆議院"));
    case "houseOfficersList":
      return [];
    default:
      return items;
  }
}

function filterByTarget(items: Person[], target?: Target, mode: AppMode = "basic", related: Partial<Record<Target, Person[]>> = {}): Person[] {
  if (!target) return items;
  if (mode === "entrance") return filterEntranceMode(items, target, related);
  return items;
}

export function parsePersonsJson(value: unknown, target?: Target, mode: AppMode = "basic", related: Partial<Record<Target, Person[]>> = {}): Person[] {
  if (!Array.isArray(value)) return [];

  const items = value
    .map((item, index) => normalizePerson(item, index))
    .filter((item): item is Person => item !== null)
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && !!item.name)
    .map((item) => applyNameKanaOverride(item, target));

  return filterByTarget(items, target, mode, related);
}

export async function loadPersonsForTarget(baseUrl: string, target: Target, mode: AppMode = "basic"): Promise<Person[]> {
  const related: Partial<Record<Target, Person[]>> = {};
  if (mode === "entrance") {
    if (target === "senators") related.councilorsOfficersList = await loadRawPersons(baseUrl, "councilorsOfficersList");
    if (target === "representatives") {
      const [ministers, viceMinisters, parliamentarySecretaries] = await Promise.all([
        loadRawPersons(baseUrl, "ministers"),
        loadRawPersons(baseUrl, "viceMinisters"),
        loadRawPersons(baseUrl, "parliamentarySecretaries"),
      ]);
      related.ministers = ministers;
      related.viceMinisters = viceMinisters;
      related.parliamentarySecretaries = parliamentarySecretaries;
    }
  }

  const res = await fetch(`${baseUrl}${targetDataPath[target]}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load: ${res.status}`);
  const json = (await res.json()) as unknown;
  return parsePersonsJson(json, target, mode, related);
}
