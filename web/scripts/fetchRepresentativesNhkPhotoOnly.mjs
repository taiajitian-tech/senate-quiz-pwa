import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';

const DATA_PATH = path.resolve('public/data/representatives.json');
const REPORT_PATH = path.resolve('public/data/representatives-nhk-photo-report.json');
const REVIEW_PATH = path.resolve('public/data/representatives-nhk-photo-review.json');
const TIMEOUT_MS = Math.max(3000, Number(process.env.REP_IMAGE_TIMEOUT_MS || 12000));
const START_PAGE = Number(process.env.REP_IMAGE_NHK_START_PAGE || 0);
const END_PAGE = Number(process.env.REP_IMAGE_NHK_END_PAGE || 49);

const NHK_PAGE_URLS = [];
for (let i = START_PAGE; i <= END_PAGE; i += 1) {
  const page = String(i).padStart(2, '0');
  NHK_PAGE_URLS.push(`https://news.web.nhk/senkyo/database/shugiin/${page}/tousen_toukaku_senkyoku.html`);
  NHK_PAGE_URLS.push(`https://news.web.nhk/senkyo/database/shugiin/${page}/tousen_toukaku_hirei.html`);
}

const NAME_ALIASES = {
  '安藤たかお': ['安藤高夫']
};

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeSpace(value = '') {
  return String(value ?? '').replace(/\u3000/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanName(value = '') {
  return normalizeSpace(value)
    .normalize('NFKC')
    .replace(/[ 　\t\r\n]/g, '')
    .replace(/[()（）「」『』［］【】〔〕]/g, '')
    .replace(/[・･]/g, '')
    .replace(/[‐‑‒–—―ー－\-]/g, '')
    .replace(/君$/u, '')
    .trim();
}

function normalizeUrl(url = '', base = '') {
  const raw = String(url || '').trim().replace(/&amp;/g, '&');
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return '';
  try {
    const parsed = new URL(raw, base || undefined);
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return '';
  }
}

function isNhkPhotoUrl(url = '') {
  return /^https?:\/\//i.test(url) && /news\.web\.nhk|www3\.nhk\.or\.jp/i.test(url) && /\/photo\//.test(url);
}

function shouldSkipImage(url = '', context = '') {
  const hay = `${url} ${context}`.toLowerCase();
  return /logo|icon|banner|btn|button|sprite|loading|blank|ogp|og-image/.test(hay);
}

function buildAliases(member) {
  const set = new Set();
  const add = (value) => {
    const cleaned = cleanName(value || '');
    if (cleaned) set.add(cleaned);
  };

  add(member?.name);
  add(member?.kana);
  add(member?.furigana);
  add(member?.yomi);

  for (const alias of NAME_ALIASES[member?.name] || []) add(alias);

  return [...set];
}

function buildAliasMap(members) {
  const aliasMap = new Map();
  for (const member of members) {
    for (const alias of buildAliases(member)) {
      if (!aliasMap.has(alias)) aliasMap.set(alias, []);
      aliasMap.get(alias).push(member);
    }
  }
  return aliasMap;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; nhk-photo-only/1.0)',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'accept-language': 'ja,en;q=0.8'
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timer);
  }
}

function extractNameHints($, img) {
  const hints = new Set();
  const add = (value) => {
    const cleaned = cleanName(value || '');
    if (cleaned) hints.add(cleaned);
  };

  add($(img).attr('alt'));
  add($(img).attr('title'));
  add($(img).attr('data-name'));
  add($(img).attr('aria-label'));
  add($(img).parent().text());
  add($(img).closest('figure,li,article,div').find('figcaption,.name,.candidate-name,.searchResultName').first().text());

  return [...hints];
}

function scoreCandidate(url, hints) {
  let score = 0;
  if (isNhkPhotoUrl(url)) score += 100;
  if (/shugiin/i.test(url)) score += 5;
  if (hints.length > 0) score += 10;
  return score;
}

function collectCandidatesFromHtml(html, pageUrl) {
  const $ = cheerio.load(html);
  const found = [];
  const seen = new Set();

  $('img').each((_, img) => {
    const src = normalizeUrl(
      $(img).attr('src') ||
      $(img).attr('data-src') ||
      $(img).attr('data-original') ||
      $(img).attr('data-lazy-src') ||
      '',
      pageUrl
    );
    if (!isNhkPhotoUrl(src)) return;

    const hints = extractNameHints($, img);
    if (!hints.length) return;
    if (shouldSkipImage(src, hints.join(' '))) return;

    const key = `${src}__${hints.join('|')}`;
    if (seen.has(key)) return;
    seen.add(key);

    found.push({
      url: src,
      hints,
      sourcePage: pageUrl,
      score: scoreCandidate(src, hints)
    });
  });

  return found;
}

function attachCandidatesToMembers(candidates, aliasMap, candidateMap) {
  for (const candidate of candidates) {
    const matchedMembers = new Set();
    for (const hint of candidate.hints) {
      for (const member of aliasMap.get(hint) || []) matchedMembers.add(member);
    }

    for (const member of matchedMembers) {
      const key = cleanName(member.name);
      if (!candidateMap.has(key)) candidateMap.set(key, []);
      candidateMap.get(key).push(candidate);
    }
  }
}

function uniqueCandidates(items) {
  const map = new Map();
  for (const item of items) {
    const key = item.url;
    const prev = map.get(key);
    if (!prev || item.score > prev.score) map.set(key, item);
  }
  return [...map.values()].sort((a, b) => b.score - a.score);
}

function applyNhkResults(members, candidateMap) {
  let applied = 0;
  const review = [];

  for (const member of members) {
    const key = cleanName(member.name);
    const candidates = uniqueCandidates(candidateMap.get(key) || []);
    const best = candidates[0];
    const currentImage = normalizeSpace(member.image || '');
    const currentIsNhkPhoto = isNhkPhotoUrl(currentImage);

    member.imageCandidatesNhk = candidates.slice(0, 5).map((item) => ({
      url: item.url,
      sourcePage: item.sourcePage,
      score: item.score,
      hints: item.hints
    }));

    if (best && candidates.length === 1) {
      member.image = best.url;
      member.imageSource = 'nhk-photo-only';
      member.imageSourceUrl = best.sourcePage;
      member.imageStatus = 'official';
      member.imageScore = best.score;
      member.aiGuess = false;
      member.sourceType = 'verified';
      applied += 1;
      continue;
    }

    if (currentIsNhkPhoto) {
      member.imageStatus = 'official';
      member.imageScore = Number(member.imageScore || 100);
      continue;
    }

    member.imageStatus = best ? 'review' : 'missing';
    member.imageScore = best ? best.score : 0;
    review.push({
      name: member.name,
      party: member.party || '',
      status: member.imageStatus,
      currentImage,
      candidates: candidates.slice(0, 5)
    });
  }

  return { applied, review };
}

async function main() {
  const members = readJson(DATA_PATH, []);
  if (!Array.isArray(members) || members.length === 0) {
    throw new Error(`No representatives found: ${DATA_PATH}`);
  }

  const aliasMap = buildAliasMap(members);
  const candidateMap = new Map();
  const report = {
    startedAt: new Date().toISOString(),
    pageCount: NHK_PAGE_URLS.length,
    scannedPages: 0,
    candidateCount: 0,
    pages: [],
    applied: 0,
    reviewCount: 0,
    missingCount: 0
  };

  for (const pageUrl of NHK_PAGE_URLS) {
    try {
      const html = await fetchHtml(pageUrl);
      const found = collectCandidatesFromHtml(html, pageUrl);
      report.pages.push({ pageUrl, candidates: found.length });
      report.scannedPages += 1;
      report.candidateCount += found.length;
      attachCandidatesToMembers(found, aliasMap, candidateMap);
      console.log(`nhk-scan ${pageUrl} -> ${found.length}`);
    } catch (error) {
      report.pages.push({ pageUrl, error: String(error?.message || error) });
      console.log(`nhk-scan ${pageUrl} -> error`);
    }
  }

  const { applied, review } = applyNhkResults(members, candidateMap);
  report.applied = applied;
  report.reviewCount = review.filter((item) => item.status === 'review').length;
  report.missingCount = review.filter((item) => item.status === 'missing').length;
  report.finishedAt = new Date().toISOString();

  writeJson(DATA_PATH, members);
  writeJson(REPORT_PATH, report);
  writeJson(REVIEW_PATH, review);

  console.log(`applied=${applied}`);
  console.log(`review=${report.reviewCount}`);
  console.log(`missing=${report.missingCount}`);
  console.log(`report=${REPORT_PATH}`);
  console.log(`reviewReport=${REVIEW_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
