export type Target = "senators" | "representatives" | "ministers";

export type Person = {
  id: number;
  name: string;
  group?: string;
  images: string[];
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

function isPerson(value: unknown): value is Person {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Number.isFinite(Number(v.id)) &&
    typeof v.name === "string" &&
    Array.isArray(v.images) &&
    v.images.every((img) => typeof img === "string") &&
    (v.group === undefined || typeof v.group === "string")
  );
}

export function parsePersonsJson(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPerson)
    .map((s) => ({
      id: Number(s.id),
      name: s.name.trim(),
      group: (s.group ?? "").trim(),
      images: s.images.filter(Boolean),
    }))
    .filter((s) => Number.isFinite(s.id) && !!s.name);
}
