import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WEB_DIR = path.resolve(__dirname, '..');
const DATA_DIR = path.resolve(WEB_DIR, 'public/data');
const PREV_DIR = path.resolve(WEB_DIR, '.cache/previous-data');
const OUT_PATH = path.resolve(DATA_DIR, 'updates.json');

const TARGETS = [
  { key: 'senators', path: 'senators.json', label: '参議院一般議員' },
  { key: 'representatives', path: 'representatives.json', label: '衆議院議員' },
  { key: 'ministers', path: 'ministers.json', label: '大臣' },
  { key: 'viceMinisters', path: 'vice-ministers.json', label: '副大臣' },
  { key: 'parliamentarySecretaries', path: 'parliamentary-secretaries.json', label: '大臣政務官' },
  { key: 'councilorsOfficersList', path: 'councilors-officers.json', label: '参議院役員' },
  { key: 'houseOfficersList', path: 'house-officers.json', label: '衆議院役員一覧' },
];

function normalizeCompact(value) {
  return String(value ?? '').replace(/[\s\u3000]+/g, '').trim();
}

function toText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toImages(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    const text = value.trim();
    return text ? [text] : [];
  }
  return [];
}

function splitNameAndKana(rawName) {
  const text = toText(rawName);
  const match = text.match(/^(.*?)（([^）]+)）$/u) ?? text.match(/^(.*?)\(([^)]+)\)$/u);
  if (!match) return { name: text, kana: '' };
  return { name: match[1].trim(), kana: normalizeCompact(match[2]) };
}

function normalizeRecord(value, index) {
  if (!value || typeof value !== 'object') return null;
  const source = value;
  const rawName = toText(source.name);
  if (!rawName) return null;
  const split = splitNameAndKana(rawName);
  const id = Number.isFinite(Number(source.id)) && Number(source.id) > 0 ? Number(source.id) : index + 1;
  const name = split.name;
  const kana = normalizeCompact(toText(source.kana) || toText(source.nameKana) || toText(source.kanaName) || split.kana);
  const role = toText(source.role) || toText(source.group);
  const party = toText(source.party);
  const district = toText(source.district) || toText(source.electoralDistrict) || toText(source.constituency);
  const image = toImages(source.images ?? source.image)[0] ?? '';
  return {
    id,
    name,
    kana,
    role,
    party,
    district,
    image,
    key: `${id}:${normalizeCompact(name)}`,
  };
}

function readArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function compareTarget(target) {
  const previousRaw = readArray(path.resolve(PREV_DIR, target.path));
  const currentRaw = readArray(path.resolve(DATA_DIR, target.path));

  const previous = previousRaw.map(normalizeRecord).filter(Boolean);
  const current = currentRaw.map(normalizeRecord).filter(Boolean);

  const previousMap = new Map(previous.map((item) => [item.key, item]));
  const currentMap = new Map(current.map((item) => [item.key, item]));

  const items = [];
  let added = 0;
  let removed = 0;
  let changed = 0;

  for (const [key, nextItem] of currentMap) {
    const prevItem = previousMap.get(key);
    if (!prevItem) {
      added += 1;
      items.push({
        target: target.key,
        targetLabel: target.label,
        name: nextItem.name,
        type: 'added',
        summary: `${nextItem.name} を追加`,
      });
      continue;
    }

    const fieldChanges = [];
    if (prevItem.name !== nextItem.name) fieldChanges.push('氏名変更');
    if (prevItem.kana !== nextItem.kana) fieldChanges.push('ふりがな変更');
    if (prevItem.role !== nextItem.role) fieldChanges.push('役職変更');
    if (prevItem.party !== nextItem.party) fieldChanges.push('所属変更');
    if (prevItem.district !== nextItem.district) fieldChanges.push('選挙区変更');
    if (prevItem.image !== nextItem.image) fieldChanges.push('画像更新');

    if (fieldChanges.length > 0) {
      changed += 1;
      items.push({
        target: target.key,
        targetLabel: target.label,
        name: nextItem.name,
        type: 'changed',
        summary: `${nextItem.name}：${fieldChanges.join('・')}`,
      });
    }
  }

  for (const [key, prevItem] of previousMap) {
    if (currentMap.has(key)) continue;
    removed += 1;
    items.push({
      target: target.key,
      targetLabel: target.label,
      name: prevItem.name,
      type: 'removed',
      summary: `${prevItem.name} を一覧から除外`,
    });
  }

  return {
    target: target.key,
    label: target.label,
    counts: { added, removed, changed },
    items,
  };
}

function main() {
  const generatedAt = new Date().toISOString();
  const results = TARGETS.map(compareTarget);
  const items = results.flatMap((result) => result.items);
  const summaries = results
    .map((result) => ({
      target: result.target,
      label: result.label,
      added: result.counts.added,
      removed: result.counts.removed,
      changed: result.counts.changed,
      total: result.counts.added + result.counts.removed + result.counts.changed,
    }))
    .filter((result) => result.total > 0);

  const payload = {
    generatedAt,
    totalChanges: items.length,
    hasUpdates: items.length > 0,
    summaries,
    items: items.slice(0, 80),
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`updates: ${payload.totalChanges}`);
}

main();
