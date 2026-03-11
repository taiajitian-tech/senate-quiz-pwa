export type Target = "senators" | "representatives" | "ministers";

export type Person = {
  id: number;
  name: string;
  group?: string;
  images: string[];
  aiGuess?: boolean;
};

export const targetLabels: Record<Target, string> = {
  senators: "現職議員",
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

function normalizePerson(value: unknown, index: number): Person | null {
  if (!value || typeof value !== "object") return null;
  const v = value as RawPerson;

  const rawName = toText(v.name);
  if (!rawName) return null;

  const rawId = Number(v.id);
  const id = Number.isFinite(rawId) && rawId > 0 ? rawId : index + 1;

  const group = toText(v.group) || toText(v.party) || toText(v.role);
  const images = toImages(v.images ?? v.image);
  const aiGuess = v.aiGuess === true || toText(v.imageSource) === "web-fallback";

  return {
    id,
    name: rawName,
    group,
    images,
    aiGuess,
  };
}

export function parsePersonsJson(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item, index) => normalizePerson(item, index))
    .filter((item): item is Person => item !== null)
    .filter((item) => Number.isFinite(item.id) && item.id > 0 && !!item.name);
}
