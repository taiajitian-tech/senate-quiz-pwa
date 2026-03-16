import fs from 'node:fs';
import path from 'node:path';

const DATA_PATH = path.resolve('public/data/representatives.json');
const REPORT_PATH = path.resolve('public/data/representatives-image-fill-report.json');
const CONCURRENCY = Math.max(1, Number(process.env.REP_FILL_CONCURRENCY || 4));
const TIMEOUT_MS = Math.max(3000, Number(process.env.REP_FILL_TIMEOUT_MS || 12000));
const DELAY_MS = Math.max(0, Number(process.env.REP_FILL_DELAY_MS || 100));
const TARGET_NAMES = String(process.env.REP_FILL_NAMES || '')
  .split(',')
  .map((v) => normalizeSpace(v))
  .filter(Boolean);

function normalizeSpace(value) {
  return String(value || '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanName(value) {
  return normalizeSpace(value).replace(/君$/u, '').replace(/\s+/g, '');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; representative-image-fill/1.0)',
        'accept': 'application/json,text/plain;q=0.9,*/*;q=0.8',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

function pickThumbnail(page) {
  const thumb = page?.thumbnail?.source;
  if (!thumb) return '';
  const text = String(thumb).toLowerCase();
  if (/logo|poster|map|flag|symbol/.test(text)) return '';
  return thumb;
}

async function tryJaWikipediaDirect(name) {
  const url = `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|info&piprop=thumbnail&pithumbsize=800&inprop=url&titles=${encodeURIComponent(name)}`;
  const json = await fetchJson(url);
  const pages = Object.values(json?.query?.pages || {});
  const page = pages.find((item) => !item.missing);
  const image = pickThumbnail(page);
  if (!page || !image) return null;
  return {
    image,
    source: 'wikipedia-api',
    sourceUrl: page.fullurl || `https://ja.wikipedia.org/wiki/${encodeURIComponent(name)}`,
    confidence: 'direct-title'
  };
}

async function tryJaWikipediaSearch(name) {
  const searchUrl = `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(name)}&srlimit=5&srwhat=title`;
  const searchJson = await fetchJson(searchUrl);
  const candidates = searchJson?.query?.search || [];
  const target = cleanName(name);
  const exact = candidates.find((item) => cleanName(item.title) === target) || candidates[0];
  if (!exact) return null;
  const detailUrl = `https://ja.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages|info&piprop=thumbnail&pithumbsize=800&inprop=url&pageids=${encodeURIComponent(String(exact.pageid))}`;
  const detailJson = await fetchJson(detailUrl);
  const pages = Object.values(detailJson?.query?.pages || {});
  const page = pages[0];
  const image = pickThumbnail(page);
  if (!image) return null;
  return {
    image,
    source: 'wikipedia-search',
    sourceUrl: page?.fullurl || `https://ja.wikipedia.org/wiki/${encodeURIComponent(exact.title)}`,
    confidence: cleanName(exact.title) === target ? 'search-exact' : 'search-loose'
  };
}

async function tryWikidataP18(name) {
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&origin=*&language=ja&type=item&limit=5&search=${encodeURIComponent(name)}`;
  const searchJson = await fetchJson(searchUrl);
  const entries = searchJson?.search || [];
  if (!entries.length) return null;
  const target = cleanName(name);
  const entry =
    entries.find((item) => cleanName(item.label) === target) ||
    entries.find((item) => (item.aliases || []).some((alias) => cleanName(alias) === target)) ||
    null;
  if (!entry?.id) return null;

  const entityUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entry.id}.json`;
  const entityJson = await fetchJson(entityUrl);
  const entity = entityJson?.entities?.[entry.id];
  const fileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!fileName) return null;

  const imageInfoUrl = `https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url&titles=${encodeURIComponent(`File:${fileName}`)}`;
  const imageInfoJson = await fetchJson(imageInfoUrl);
  const page = Object.values(imageInfoJson?.query?.pages || {})[0];
  const image = page?.imageinfo?.[0]?.url || '';
  if (!image) return null;
  return {
    image,
    source: 'wikidata-p18',
    sourceUrl: `https://www.wikidata.org/wiki/${entry.id}`,
    confidence: 'wikidata-exact'
  };
}

async function resolveImage(member) {
  const attempts = [tryJaWikipediaDirect, tryJaWikipediaSearch, tryWikidataP18];
  const errors = [];
  for (const attempt of attempts) {
    try {
      const result = await attempt(member.name);
      if (result?.image) return { ...result, errors };
    } catch (error) {
      errors.push({ step: attempt.name, error: String(error?.message || error) });
    }
    if (DELAY_MS) await sleep(DELAY_MS);
  }
  return { image: '', source: '', sourceUrl: '', confidence: 'not-found', errors };
}

async function runQueue(items, worker, concurrency) {
  const results = [];
  let index = 0;
  async function next() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length || 1) }, () => next()));
  return results;
}

async function main() {
  const representatives = readJson(DATA_PATH, []);
  const targets = representatives.filter((member) => {
    if (!member || typeof member !== 'object') return false;
    if (TARGET_NAMES.length) return TARGET_NAMES.includes(normalizeSpace(member.name));
    return !normalizeSpace(member.image);
  });

  const report = {
    startedAt: new Date().toISOString(),
    targetCount: targets.length,
    filled: [],
    failed: []
  };

  console.log(`targets=${targets.length}`);

  await runQueue(
    targets,
    async (member, idx) => {
      console.log(`[${idx + 1}/${targets.length}] ${member.name}`);
      const result = await resolveImage(member);
      if (result.image) {
        member.image = result.image;
        member.imageSource = result.source;
        member.imageSourceUrl = result.sourceUrl;
        member.aiGuess = false;
        member.sourceType = member.sourceType || 'verified';
        report.filled.push({
          name: member.name,
          image: result.image,
          imageSource: result.source,
          imageSourceUrl: result.sourceUrl,
          confidence: result.confidence
        });
        console.log(`  filled via ${result.source}`);
      } else {
        report.failed.push({ name: member.name, errors: result.errors });
        console.log('  missing');
      }
    },
    CONCURRENCY
  );

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(representatives, null, 2)}\n`, 'utf8');
  report.finishedAt = new Date().toISOString();
  report.filledCount = report.filled.length;
  report.failedCount = report.failed.length;
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(`filled=${report.filledCount} failed=${report.failedCount}`);
  console.log(`report=${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
