import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';

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
  const role = toText(source.subRole) || toText(source.role) || toText(source.group);
  const party = toText(source.party);
  const district = toText(source.district) || toText(source.electoralDistrict) || toText(source.constituency);
  const image = toImages(source.images ?? source.image)[0] ?? '';
  const termsNumber = Number(source.terms ?? source.wins);
  const terms = Number.isInteger(termsNumber) && termsNumber > 0 ? termsNumber : null;
  return {
    id,
    name,
    kana,
    role,
    party,
    district,
    terms,
    image,
    key: normalizeCompact(name),
  };
}

function readArrayFromGit(relPath) {
  try {
    const sha = execSync(
      'git log -1 --format="%H" -- web/public/data/updates.json',
      { cwd: path.resolve(WEB_DIR, '..'), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    ).trim();
    if (!sha) return null;
    const data = execSync(
      `git show ${sha}:${relPath}`,
      { cwd: path.resolve(WEB_DIR, '..'), encoding: 'utf8', stdio: ['pipe','pipe','pipe'] }
    );
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function readArray(filePath) {
  const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`名簿の形式が不正です: ${filePath}`);
  return parsed;
}

function compareTarget(target) {
  const gitRelPath = `web/public/data/${target.path}`;
  const snapshotPath = path.resolve(PREV_DIR, target.path);
  const previousRaw = fs.existsSync(snapshotPath)
    ? readArray(snapshotPath)
    : readArrayFromGit(gitRelPath) ?? [];
  const currentRaw = readArray(path.resolve(DATA_DIR, target.path));

  return compareRecords(target, previousRaw, currentRaw);
}

export function compareRecords(target, previousRaw, currentRaw) {
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
        summary: `${nextItem.name}氏を${target.label}一覧に追加${nextItem.role ? `（${nextItem.role}）` : nextItem.party ? `（${nextItem.party}）` : ''}`,
      });
      continue;
    }

    const describe = (label, before, after) => {
      const b = before || 'なし';
      const a = after || 'なし';
      return `${label}：${b} → ${a}`;
    };

    const fieldChanges = [];
    if (prevItem.name !== nextItem.name) fieldChanges.push(describe('氏名', prevItem.name, nextItem.name));
    if (prevItem.kana !== nextItem.kana) fieldChanges.push(describe('ふりがな', prevItem.kana, nextItem.kana));
    if (prevItem.role !== nextItem.role) {
      const roles = value => value.split(/\s*\/\s*/u).filter(Boolean);
      const before = roles(prevItem.role);
      const after = roles(nextItem.role);
      const removedRoles = before.filter(role => !after.includes(role));
      const addedRoles = after.filter(role => !before.includes(role));
      if (removedRoles.length && addedRoles.length) fieldChanges.push(describe('役職', removedRoles.join('・'), addedRoles.join('・')));
      else if (addedRoles.length) fieldChanges.push(`役職に「${addedRoles.join('・')}」が追加`);
      else if (removedRoles.length) fieldChanges.push(`役職から「${removedRoles.join('・')}」が削除`);
      else fieldChanges.push(describe('役職', prevItem.role, nextItem.role));
    }
    if (prevItem.party !== nextItem.party) fieldChanges.push(describe('所属', prevItem.party, nextItem.party));
    if (prevItem.district !== nextItem.district) fieldChanges.push(describe('選挙区', prevItem.district, nextItem.district));
    if (prevItem.terms !== nextItem.terms) fieldChanges.push(describe('当選回数', prevItem.terms ? `${prevItem.terms}回` : '', nextItem.terms ? `${nextItem.terms}回` : ''));
    if (prevItem.image !== nextItem.image) fieldChanges.push('顔写真が変更');

    if (fieldChanges.length > 0) {
      changed += 1;
      items.push({
        target: target.key,
        targetLabel: target.label,
        name: nextItem.name,
        type: 'changed',
        summary: `${nextItem.name}氏：${fieldChanges.join('。')}`,
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
      summary: `${prevItem.name}氏を${target.label}一覧から除外${prevItem.role ? `（${prevItem.role}）` : ''}`,
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

export function mergeUpdateHistory(previousItems, newItems, detectedAt, previousDate = detectedAt) {
  const tag = (item, date) => {
    const eventDate = item.detectedAt || date;
    const id = item.id || createHash('sha256').update(JSON.stringify([
      item.target, item.name, item.type, item.summary, eventDate,
    ])).digest('hex');
    return { ...item, id, detectedAt: eventDate };
  };
  const seen = new Set();
  return [
    ...newItems.map(item => tag(item, detectedAt)),
    ...previousItems.filter(item => item.target !== 'notice').map(item => tag(item, previousDate)),
  ].filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

const manualContent = ({ id: _id, detectedAt: _date, ...item }) => item;

export function prepareManualNotices(items, previousItems, generatedAt) {
  return items.map(item => {
    const old = previousItems.find(previous => previous.target === 'notice' && JSON.stringify(manualContent(previous)) === JSON.stringify(manualContent(item)));
    const date = item.name.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/u);
    const detectedAt = old?.detectedAt || (old
      ? date ? new Date(Date.UTC(Number(date[1]), Number(date[2]) - 1, Number(date[3]))).toISOString() : undefined
      : generatedAt);
    return {
      ...item,
      id: old?.id || JSON.stringify([item.target, item.name, item.type, item.summary]),
      ...(detectedAt ? { detectedAt } : {}),
    };
  });
}

async function main() {
  const generatedAt = new Date().toISOString();
  const results = TARGETS.map(compareTarget);
  const items = results.flatMap((result) => result.items);
  const itemsWithReasons = await mapWithConcurrency(
    items,
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

  const rawManualNotices = (() => {
    try {
      const raw = JSON.parse(fs.readFileSync(path.resolve(DATA_DIR, 'manual-notices.json'), 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  })();
  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync(OUT_PATH, 'utf8'));
  } catch {
    // 初回生成時は保持するお知らせがない。
  }
  const previousItems = Array.isArray(previous.items) ? previous.items : [];
  const manualNotices = prepareManualNotices(rawManualNotices, previousItems, generatedAt);
  const automaticItems = mergeUpdateHistory(previousItems, itemsWithReasons, generatedAt, previous.generatedAt || generatedAt);
  const manualSignature = items => items.map(item => JSON.stringify(manualContent(item))).sort().join('\n');
  const noticeChanged = manualSignature(rawManualNotices) !== manualSignature(previousItems.filter((item) => item.target === 'notice'));
  const finalItems = [...manualNotices, ...automaticItems].sort((a, b) => (Date.parse(b.detectedAt) || 0) - (Date.parse(a.detectedAt) || 0));

  const payload = {
    generatedAt: itemsWithReasons.length > 0 || noticeChanged ? generatedAt : previous.generatedAt || generatedAt,
    checkedAt: generatedAt,
    totalChanges: itemsWithReasons.length > 0 ? itemsWithReasons.length : previous.totalChanges || 0,
    hasUpdates: finalItems.length > 0,
    summaries: itemsWithReasons.length > 0 ? summaries : (Array.isArray(previous.summaries) ? previous.summaries : []),
    items: finalItems,
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`updates: ${payload.totalChanges}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) await main();
