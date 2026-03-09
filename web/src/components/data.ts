export type Senator = {
  id: number;
  name: string;
  group?: string;
  images: string[];
};

function isSenator(value: unknown): value is Senator {
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

export function parseSenatorsJson(value: unknown): Senator[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isSenator)
    .map((s) => ({
      id: Number(s.id),
      name: s.name.trim(),
      group: (s.group ?? "").trim(),
      images: s.images.filter(Boolean),
    }))
    .filter((s) => Number.isFinite(s.id) && !!s.name);
}
