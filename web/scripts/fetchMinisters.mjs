import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import { resolveKanteiMeiboUrls } from './kanteiMeibo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, '../public/data/ministers.json');
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

function normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeCompact(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/[\s\u3000]+/gu, '')
    .trim();
}

function toPlainName(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/君$/u, '')
    .trim();
}

function stableId(name) {
  const seed = `ministers:${name}`;
  let hash = 0;
  for (const ch of seed) hash = (hash * 131 + ch.codePointAt(0)) % 90000000;
  return 10000000 + hash;
}

function readExisting() {
  const raw = fs.readFileSync(DATA_FILE, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function buildExistingMap(items) {
  const byName = new Map();
  for (const item of items) {
    const key = normalizeCompact(item?.name);
    if (!key) continue;
    byName.set(key, item);
  }
  return byName;
}

function extractCandidates(html) {
  const $ = cheerio.load(html);
  const out = [];

  $('img').each((_, el) => {
    const src = $(el).attr('src') || '';
    if (!src) return;
    if (!/\/content\//.test(src) && !/\.(jpe?g|png|webp)$/i.test(src)) return;

    const container = $(el).closest('li, section, div');
    const text = normalizeWhitespace(container.text());
    if (!text) return;

    const parts = text
      .split(/\n+/)
      .map((s) => normalizeWhitespace(s))
      .filter(Boolean);

    const role = parts.find((p) => /(内閣総理大臣|大臣)/.test(p)) || '';
    const name = parts.find((p) => /[一-龯ぁ-んァ-ン]/.test(p) && !/(内閣|官邸|一覧|ページ|大臣|総理)/.test(p)) || '';

    if (!name) return;

    out.push({
      name: toPlainName(name),
      group: role || '',
      image: src.startsWith('http') ? src : `https://www.kantei.go.jp${src}`,
    });
  });

  const unique = [];
  const seen = new Set();
  for (const item of out) {
    const key = normalizeCompact(item.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    unique.push(item);
  }
  return unique;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

async function main() {
  const existing = readExisting();
  const existingByName = buildExistingMap(existing);

  let parsed = [];
  try {
    const { ministersIndexUrl } = await resolveKanteiMeiboUrls();
    console.log(`ministers source: ${ministersIndexUrl}`);
    const html = await fetchText(ministersIndexUrl);
    parsed = extractCandidates(html);
  } catch (err) {
    console.warn('ministers fetch failed, keep existing:', err?.message || err);
    console.log(`ministers kept: ${existing.length}`);
    return;
  }

  if (parsed.length < 10) {
    console.warn(`ministers parse suspicious (${parsed.length}), keep existing`);
    console.log(`ministers kept: ${existing.length}`);
    return;
  }

  const merged = parsed.map((item) => {
    const key = normalizeCompact(item.name);
    const prev = existingByName.get(key);
    return {
      id: Number(prev?.id) || stableId(item.name),
      name: item.name,
      group: item.group || prev?.group || '',
      images: item.image ? [item.image] : Array.isArray(prev?.images) ? prev.images : [],
    };
  });

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  console.log(`ministers: ${merged.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
