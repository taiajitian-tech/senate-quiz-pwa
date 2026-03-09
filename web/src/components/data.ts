export type Person = {
  id: number;
  name: string;
  group?: string;
  images: string[];
};

export type TargetKey = "senators" | "ministers";

export const TARGET_LABEL: Record<TargetKey, string> = {
  senators: "参議院議員",
  ministers: "現職大臣",
};

export const TARGET_DATA_PATH: Record<TargetKey, string> = {
  senators: "data/senators.json",
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

export function cleanDisplayName(name: string): string {
  return name.split("：")[0].split(":")[0].trim();
}

export function parsePeopleJson(value: unknown): Person[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isPerson)
    .map((p) => ({
      id: Number(p.id),
      name: cleanDisplayName(p.name.trim()),
      group: (p.group ?? "").trim(),
      images: p.images.filter(Boolean),
    }))
    .filter((p) => Number.isFinite(p.id) && !!p.name);
}
