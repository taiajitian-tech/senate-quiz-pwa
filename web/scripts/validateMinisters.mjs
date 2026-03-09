import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const file = path.resolve(__dirname, "../public/data/ministers.json");

const raw = fs.readFileSync(file, "utf8");
const parsed = JSON.parse(raw);

if (!Array.isArray(parsed) || parsed.length === 0) {
  throw new Error("ministers.json is empty or not an array");
}

const seen = new Set();
for (const [index, item] of parsed.entries()) {
  if (!item || typeof item !== "object") throw new Error(`Invalid item at ${index}`);
  const id = Number(item.id);
  if (!Number.isFinite(id)) throw new Error(`Invalid id at ${index}`);
  if (seen.has(id)) throw new Error(`Duplicate id: ${id}`);
  seen.add(id);
  if (typeof item.name !== "string" || !item.name.trim()) throw new Error(`Invalid name for id ${id}`);
  if (typeof item.group !== "string" || !item.group.trim()) throw new Error(`Invalid group for id ${id}`);
  if (!Array.isArray(item.images) || item.images.length === 0) throw new Error(`Missing images for id ${id}`);
  for (const img of item.images) {
    if (typeof img !== "string" || !/^https?:\/\//.test(img)) {
      throw new Error(`Invalid image URL for id ${id}`);
    }
  }
}

console.log(`ministers.json OK (${parsed.length})`);
