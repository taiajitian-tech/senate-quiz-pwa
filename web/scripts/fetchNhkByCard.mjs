import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const BASE_URL = "https://www3.nhk.or.jp";
const ORIGIN = "https://www3.nhk.or.jp";

const PAGE_URLS = [
  `${ORIGIN}/senkyo-data/database/shugiin/`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/hirei/`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/senkyoku/`,
  `${ORIGIN}/news/special/election2024/`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/tousen_toukaku_hirei.html`,
  `${ORIGIN}/news/special/election2024/koho/`,
];

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return normalizeSpace(String(value)).replace(/[ 　\t\r\n]/g, "").trim();
}

function normalizeUrl(url = "", base = "") {
  const raw = String(url || "").trim().replace(/&amp;/g, "&");
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return "";
  try {
    const parsed = new URL(raw, base || BASE_URL);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function looksLikeImageUrl(value = "") {
  return /^https?:\/\//i.test(value) && /\.(jpg|jpeg|png|webp)(\?|$)/i.test(value);
}

function loadMembers() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
}

function loadFixTargetSet() {
  if (!fs.existsSync(FIX_TARGETS_PATH)) return new Set();
  try {
    const items = JSON.parse(fs.readFileSync(FIX_TARGETS_PATH, "utf8"));
    return new Set((Array.isArray(items) ? items : []).map((item) => cleanName(item?.name || "")).filter(Boolean));
  } catch {
    return new Set();
  }
}

function shouldProcessMember(member, fixSet) {
  const hasImage = Boolean(normalizeSpace(member?.image || ""));
  if (TARGET_MODE === "all") return true;
  if (TARGET_MODE === "fix") return fixSet.has(cleanName(member?.name || ""));
  return !hasImage;
}

function markResolved(member, found) {
  member.image = found.url;
  member.imageSource = "nhk-card";
  member.imageSourceUrl = found.sourceUrl || found.url;
  member.aiGuess = false;
  member.sourceType = "verified";
  member.imageMaskBottom = false;
  member.imageMaskMode = "none";
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

function collectImageUrl(card, sourceUrl) {
  const img = card.find('.candidate_profile .kao img, .kao img, img').first();
  if (!img.length) return "";
  const attrs = img.get(0)?.attribs || {};
  const candidates = [
    attrs.src,
    attrs['data-src'],
    attrs['data-original'],
    attrs['data-lazy-src'],
    attrs.srcset,
    attrs['data-srcset'],
    attrs['data-lazy-srcset'],
  ];
  for (const raw of candidates) {
    const v = String(raw || '').trim();
    if (!v) continue;
    const first = v.split(',')[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, sourceUrl);
    if (looksLikeImageUrl(url)) return url;
  }
  return '';
}

function collectName(card) {
  const selectors = [
    '.candidate_name',
    '.candidate_profile .candidate_name',
    '.candidate_profile .name',
    '.name',
    '[class*="candidate_name"]',
    '[class*="name"]',
    'h2',
    'h3',
    'dt',
    'strong',
  ];
  for (const selector of selectors) {
    const text = cleanName(card.find(selector).first().text());
    if (text) return text;
  }
  return '';
}

function collectCardsFromHtml(html = '', sourceUrl = '', targetSet = null) {
  const $ = cheerio.load(html);
  const results = [];
  $('.candidate_set .candidate, .candidate_set > .candidate, .candidate').each((_, el) => {
    const card = $(el);
    const name = collectName(card);
    const url = collectImageUrl(card, sourceUrl);
    if (!name || !url) return;
    if (targetSet && targetSet.size && !targetSet.has(name)) return;
    results.push({ name, url, sourceUrl, text: normalizeSpace(card.text()) });
  });
  return results;
}

async function crawlNhk(targetSet) {
  const all = [];
  let visitedPages = 0;
  let lastError = null;
  for (const url of PAGE_URLS) {
    try {
      const html = await fetchText(url);
      visitedPages += 1;
      const cards = collectCardsFromHtml(html, url, targetSet);
      console.log(`nhk-card page=${url} bytes=${html.length} cards=${cards.length}`);
      all.push(...cards);
    } catch (error) {
      lastError = error;
      console.log(`nhk-card page-failed=${url} error=${error.message}`);
    }
  }
  if (!visitedPages && lastError) throw lastError;
  return { visitedPages, cards: all };
}

export async function main() {
  const members = loadMembers();
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetSet = new Set(targets.map((member) => cleanName(member.name)).filter(Boolean));

  console.log(`nhk-card mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log('nhk-card nothing-to-process');
    return;
  }

  const { visitedPages, cards } = await crawlNhk(targetSet);
  if (!visitedPages) throw new Error('NHK card crawl failed: no pages fetched');
  if (!cards.length) throw new Error(`NHK card crawl failed: visitedPages=${visitedPages} cards=0`);

  const byName = new Map();
  for (const item of cards) {
    if (!byName.has(item.name)) byName.set(item.name, item);
  }

  let filled = 0;
  let missing = 0;
  for (const member of targets) {
    const found = byName.get(cleanName(member.name));
    if (found?.url) {
      markResolved(member, found);
      filled += 1;
      console.log(`filled: ${member.name} -> ${found.url}`);
    } else {
      missing += 1;
      console.log(`missing: ${member.name}`);
    }
  }

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(members, null, 2)}\n`, 'utf8');
  console.log(`nhk-card complete visited-pages=${visitedPages} cards=${cards.length} matched=${filled} missing=${missing}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
