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

const NEWS_TIMEOUT_MS = 4_000;
const NEWS_MAX_ITEMS = 8;
const NEWS_CONCURRENCY = 2;
const NEWS_REASON_LIMIT = 12;
const NEWS_USER_AGENT = 'senate-quiz-pwa-updates-bot/1.0';

async function httpFetch(url, options = undefined) {
  if (typeof fetch === 'function') return fetch(url, options);
  const mod = await import('node-fetch');
  return mod.default(url, options);
}

const REMOVED_REASON_PATTERNS = [
  { key: '辞任', label: '辞任報道あり', regex: /(辞任|辞職|議員辞職|辞任届)/u },
  { key: '更迭', label: '更迭報道あり', regex: /(更迭|罷免)/u },
  { key: '失職', label: '失職報道あり', regex: /失職/u },
  { key: '死去', label: '死去報道あり', regex: /(死去|逝去|死去へ)/u },
  { key: '落選', label: '落選報道あり', regex: /落選/u },
];

const ADDED_REASON_PATTERNS = [
  { key: '繰上げ当選', label: '繰上げ当選報道あり', regex: /(繰上げ当選|繰り上げ当選)/u },
  { key: '補欠選挙', label: '補欠選挙報道あり', regex: /(補欠選挙|補選)/u },
  { key: '当選', label: '当選報道あり', regex: /(初当選|当選|初登院)/u },
  { key: '就任', label: '就任報道あり', regex: /(就任|任命|起用)/u },
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

function decodeXmlEntities(value) {
  return String(value ?? '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'")
    .trim();
}

function stripHtml(value) {
  return decodeXmlEntities(value).replace(/<[^>]+>/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function extractTag(xml, tag) {
  const match = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeXmlEntities(match[1]) : '';
}

function parseRssItems(xml) {
  const matches = xml.match(/<item>([\s\S]*?)<\/item>/gu) ?? [];
  return matches.slice(0, NEWS_MAX_ITEMS).map((entry) => {
    const title = stripHtml(extractTag(entry, 'title'));
    const link = extractTag(entry, 'link');
    const description = stripHtml(extractTag(entry, 'description'));
    const pubDate = extractTag(entry, 'pubDate');
    const sourceTitle = title.includes(' - ') ? title.split(' - ').at(-1)?.trim() ?? '' : '';
    return { title, link, description, pubDate, sourceTitle };
  }).filter((entry) => entry.title && entry.link);
}

function buildReasonPatterns(item) {
  return item.type === 'removed' ? REMOVED_REASON_PATTERNS : ADDED_REASON_PATTERNS;
}

function buildNewsQuery(item) {
  const keywords = buildReasonPatterns(item).map((entry) => entry.key).join(' OR ');
  const pieces = [item.name, item.targetLabel, keywords].filter(Boolean);
  return pieces.join(' ');
}

function scoreReasonMatch(text, pattern) {
  let score = 0;
  if (pattern.regex.test(text)) score += 4;
  if (/NHK|共同通信|時事通信|朝日新聞|読売新聞|毎日新聞|産経新聞|日経|東京新聞/u.test(text)) score += 1;
  return score;
}

function pickReason(entries, item) {
  const patterns = buildReasonPatterns(item);
  if (patterns.length === 0 || entries.length === 0) return null;

  const buckets = new Map();

  for (const entry of entries) {
    const haystack = `${entry.title} ${entry.description}`;
    for (const pattern of patterns) {
      const score = scoreReasonMatch(haystack, pattern);
      if (score <= 0) continue;
      const current = buckets.get(pattern.label) ?? { pattern, score: 0, sources: new Set(), entry };
      current.score += score;
      if (entry.sourceTitle) current.sources.add(entry.sourceTitle);
      if (!current.entry || score > current.score) current.entry = entry;
      buckets.set(pattern.label, current);
    }
  }

  const ranked = [...buckets.values()].sort((a, b) => {
    const sourceDiff = b.sources.size - a.sources.size;
    if (sourceDiff !== 0) return sourceDiff;
    return b.score - a.score;
  });

  const best = ranked[0];
  if (!best) return null;

  return {
    label: best.pattern.label,
    confidence: best.sources.size >= 2 ? 'confirmed' : 'candidate',
    sourceTitle: best.entry?.sourceTitle ?? '',
    sourceUrl: best.entry?.link ?? '',
    publishedAt: best.entry?.pubDate ?? '',
  };
}

async function fetchReasonForItem(item) {
  if (item.type !== 'added' && item.type !== 'removed') return item;

  const query = buildNewsQuery(item);
  if (!query) return item;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), NEWS_TIMEOUT_MS);

  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=ja&gl=JP&ceid=JP:ja`;
    const response = await httpFetch(url, {
      headers: { 'user-agent': NEWS_USER_AGENT },
      signal: controller.signal,
    });
    if (!response.ok) return item;
    const xml = await response.text();
    const entries = parseRssItems(xml);
    const reason = pickReason(entries, item);
    return reason ? { ...item, reason } : item;
  } catch {
    return item;
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let current = 0;

  async function runOne() {
    while (true) {
      const index = current;
      current += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }

  const size = Math.max(1, Math.min(concurrency, items.length || 1));
  await Promise.all(Array.from({ length: size }, () => runOne()));
  return results;
}

async function main() {
  const generatedAt = new Date().toISOString();
  const results = TARGETS.map(compareTarget);
  const items = results.flatMap((result) => result.items);
  const limitedItems = items.slice(0, 80);
  const itemsWithReasons = await mapWithConcurrency(
    limitedItems,
    async (item, index) => (index < NEWS_REASON_LIMIT ? fetchReasonForItem(item) : item),
    NEWS_CONCURRENCY,
  );
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
    items: itemsWithReasons,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`updates: ${payload.totalChanges}`);
}

await main();
