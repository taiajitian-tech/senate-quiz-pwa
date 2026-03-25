import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIR = path.resolve(__dirname, '../public/data');
const files = [
  'vice-ministers.json',
  'parliamentary-secretaries.json',
  'house-officers.json',
  'councilors-officers.json',
];

for (const fileName of files) {
  const full = path.join(DIR, fileName);
  const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${fileName} is empty or invalid`);
  const seen = new Set();
  for (const [index, item] of parsed.entries()) {
    const id = Number(item?.id);
    if (!Number.isFinite(id)) throw new Error(`${fileName}: invalid id at ${index}`);
    if (seen.has(id)) throw new Error(`${fileName}: duplicate id ${id}`);
    seen.add(id);
    if (typeof item?.name !== 'string' || !item.name.trim()) throw new Error(`${fileName}: invalid name at ${index}`);
    if (!Array.isArray(item?.images)) throw new Error(`${fileName}: invalid images at ${index}`);
  }
  console.log(`${fileName} OK (${parsed.length})`);
}
