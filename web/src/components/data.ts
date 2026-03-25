export type Target = "senators" | "representatives" | "ministers";

export type Person = {
  id: number;
  name: string;
  kana?: string;
  group?: string;
  party?: string;
  district?: string;
  terms?: number;
  nextElectionYear?: number;
  images: string[];
  aiGuess?: boolean;
};

export const targetLabels: Record<Target, string> = {
  senators: "現職参議院議員",
  representatives: "現職衆議院議員",
  ministers: "現職大臣",
};

export const targetTabs: Record<Target, string> = {
  senators: "参議院",
  representatives: "衆議院",
  ministers: "現職大臣",
};

export const targetDataPath: Record<Target, string> = {
  senators: "data/senators.json",
  representatives: "data/representatives.json",
  ministers: "data/ministers.json",
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
    terms,
    nextElectionYear,
    images: safeImages,
    aiGuess,
  };
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

export function parsePersonsJson(value: unknown, target?: Target): Person[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => normalizePerson(item, index))
    .filter((item): item is Person => item !== null)
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && !!item.name)
    .map((item) => applyNameKanaOverride(item, target));
}
