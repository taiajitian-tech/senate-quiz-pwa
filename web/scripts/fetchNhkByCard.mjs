import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();

const SEED_URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html",
  "https://www3.nhk.or.jp/news/special/election2024/",
];

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}
function cleanName(value = "") {
  return normalizeSpace(String(value))
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/[\u30fb・･]/g, "")
    .replace(/君$/u, "")
    .trim();
}
function normalizeUrl(url = "", base = "") {
  const raw = String(url || "").trim().replace(/&amp;/g, "&");
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return "";
  try {
    const parsed = new URL(raw, base || undefined);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}
function looksLikeImageUrl(value = "") {
  return /^https?:\/\//i.test(value) && /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(value);
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
  member.imageSource = found.source || "nhk-card";
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
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      referer: "https://www3.nhk.or.jp/news/special/election2024/",
      pragma: "no-cache",
      "cache-control": "no-cache",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}
function pickImageUrl($img, sourceUrl) {
  const attrs = $img.get(0)?.attribs || {};
  const candidates = [
    attrs.src,
    attrs["data-src"],
    attrs["data-original"],
    attrs["data-lazy-src"],
    attrs["data-image"],
    attrs.srcset,
    attrs["data-srcset"],
    attrs["data-lazy-srcset"],
  ];
  for (const raw of candidates) {
    const v = String(raw || "").trim();
    if (!v) continue;
    const first = v.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, sourceUrl);
    if (url && looksLikeImageUrl(url)) return url;
  }
  return "";
}
function extractNameFromText(text = "", targetMap) {
  const cleaned = cleanName(text);
  if (!cleaned) return null;
  if (targetMap.has(cleaned)) return targetMap.get(cleaned);
  for (const [nameClean, raw] of targetMap.entries()) {
    if (cleaned.includes(nameClean)) return raw;
  }
  return null;
}
function collectCardsFromHtml(html = "", sourceUrl = "", targetMap = new Map()) {
  const cards = [];
  const $ = cheerio.load(html);

  const CARD_SELECTORS = [
    ".candidate",
    ".candidate_profile",
    ".candidate_set .candidate",
    ".candidate_set li",
    "li.candidate",
    "article.candidate",
    ".searchResult--item",
    ".search-result-item",
    "[class*='candidate']",
  ];

  const seen = new Set();

  for (const selector of CARD_SELECTORS) {
    $(selector).each((_, el) => {
      const container = $(el);
      const text = normalizeSpace(container.text() || "");
      const rawName =
        extractNameFromText(container.find(".candidate_name, .name, .candidateName, [class*='name']").first().text(), targetMap) ||
        extractNameFromText(text, targetMap);
      if (!rawName) return;

      const img = container.find("img").first();
      if (!img.length) return;
      const imgUrl = pickImageUrl(img, sourceUrl);
      if (!imgUrl) return;

      const key = `${cleanName(rawName)}|${imgUrl}`;
      if (seen.has(key)) return;
      seen.add(key);
      cards.push({
        name: rawName,
        clean: cleanName(rawName),
        url: imgUrl,
        source: "nhk-card",
        sourceUrl,
        text,
      });
    });
  }

  if (cards.length > 0) return cards;

  $("img").each((_, el) => {
    const $img = $(el);
    const imgUrl = pickImageUrl($img, sourceUrl);
    if (!imgUrl) return;
    const container = $img.closest(".candidate, .candidate_profile, li, article, section, div, td, tr");
    const text = normalizeSpace(`${container.text() || ""} ${$img.attr("alt") || ""}`);
    const rawName = extractNameFromText(text, targetMap);
    if (!rawName) return;
    const key = `${cleanName(rawName)}|${imgUrl}`;
    if (seen.has(key)) return;
    seen.add(key);
    cards.push({
      name: rawName,
      clean: cleanName(rawName),
      url: imgUrl,
      source: "nhk-img-fallback",
      sourceUrl,
      text,
    });
  });

  return cards;
}
function chooseBest(cards) {
  const byName = new Map();
  for (const card of cards) {
    let score = 0;
    if (/candidate/i.test(card.source || "")) score += 6;
    if (/nhk-card/.test(card.source || "")) score += 4;
    if (/当選|当確|比例|小選挙区/u.test(card.text || "")) score += 2;
    const current = byName.get(card.clean);
    if (!current || score > current.score) byName.set(card.clean, { ...card, score });
  }
  return byName;
}
async function crawlNhk(targetMap) {
  const cards = [];
  let visitedPages = 0;
  for (const url of SEED_URLS) {
    try {
      const html = await fetchText(url);
      visitedPages += 1;
      const found = collectCardsFromHtml(html, url, targetMap);
      console.log(`nhk-card page=${url} bytes=${html.length} cards=${found.length}`);
      cards.push(...found);
    } catch (error) {
      console.log(`nhk-card page-failed=${url} error=${error?.message || error}`);
    }
  }
  return { visitedPages, cards };
}
async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetMap = new Map(targets.map((member) => [cleanName(member.name), member.name]).filter(([k]) => k));

  console.log(`nhk-card mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log("nhk-card nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhk(targetMap);
  console.log(`nhk-card visited-pages=${visitedPages}`);
  console.log(`nhk-card raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    console.log(`nhk-card no-match-no-fail visitedPages=${visitedPages} cards=${cards.length}`);
    return;
  }

  const best = chooseBest(cards);
  console.log(`nhk-card matched-members=${best.size}`);

  let filled = 0;
  let stillMissing = 0;
  for (const member of targets) {
    const found = best.get(cleanName(member.name));
    if (found?.url) {
      markResolved(member, found);
      filled += 1;
      console.log(`filled: ${member.name} -> ${found.source}`);
    } else {
      stillMissing += 1;
      console.log(`missing: ${member.name}`);
    }
  }

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`nhk-card complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
