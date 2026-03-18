
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const ORIGIN = "https://news.web.nhk";

const SEED_URLS = [
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
];

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}
function cleanName(value = "") {
  return normalizeSpace(String(value))
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/君$/u, "")
    .replace(/[()（）「」『』・･.\-ー]/g, "");
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
    return new Set((Array.isArray(items) ? items : []).map((item) => cleanName(item?.name || "")));
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
  member.imageSource = found.source || "nhk-html-img";
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
      "accept": "text/html,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
function collectCardsFromHtml(html = "", sourceUrl = "", targetNames = []) {
  const cards = [];
  const $ = cheerio.load(html);
  $("img").each((_, el) => {
    const attrs = el.attribs || {};
    const candidates = [
      attrs.src,
      attrs["data-src"],
      attrs["data-original"],
      attrs["data-lazy-src"],
      attrs.srcset,
      attrs["data-srcset"],
      attrs["data-lazy-srcset"],
    ];

    let imgUrl = "";
    for (const raw of candidates) {
      const v = String(raw || "").trim();
      if (!v) continue;
      const first = v.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
      const url = normalizeUrl(first, sourceUrl);
      if (url && looksLikeImageUrl(url)) {
        imgUrl = url;
        break;
      }
    }
    if (!imgUrl) return;

    const container = $(el).closest(".candidate_set, .candidate_profile, .candidate, li, article, section, tr, div");
    const containerText = normalizeSpace(container.text() || "");
    const alt = normalizeSpace(attrs.alt || "");
    const hay = cleanName(`${containerText} ${alt}`);

    const matches = targetNames.filter((item) => hay.includes(item.clean));
    if (matches.length !== 1) return;

    cards.push({
      name: matches[0].raw,
      clean: matches[0].clean,
      url: imgUrl,
      source: "nhk-html-img",
      sourceUrl,
      width: 0,
      height: 0,
      text: containerText,
    });
  });
  return cards;
}
function chooseBest(cards) {
  const byName = new Map();
  for (const card of cards) {
    let score = 0;
    if (/当選|当確|比例|小選挙区|自民|維新|国民|共産|参政|みらい|中道/u.test(card.text || "")) score += 4;
    if (/nhk-html-img/.test(card.source || "")) score += 2;
    const current = byName.get(card.clean);
    if (!current || score > current.score) byName.set(card.clean, { ...card, score });
  }
  return byName;
}
async function crawlNhk(targetNames) {
  const cards = [];
  let visitedPages = 0;
  for (const url of SEED_URLS) {
    const html = await fetchText(url);
    visitedPages += 1;
    console.log(`nhk-anyway:v3 page=${url} bytes=${html.length}`);
    const found = collectCardsFromHtml(html, url, targetNames);
    console.log(`nhk-anyway:v3 page-cards=${found.length}`);
    cards.push(...found);
  }
  return { visitedPages, cards };
}
async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetNames = targets.map((member) => ({ raw: member.name, clean: cleanName(member.name) })).filter((x) => x.clean);

  console.log(`nhk-anyway:v3 mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log("nhk-anyway:v3 nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhk(targetNames);
  console.log(`nhk-anyway:v3 visited-pages=${visitedPages}`);
  console.log(`nhk-anyway:v3 raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    throw new Error(`NHK HTML scrape failed: visitedPages=${visitedPages} cards=${cards.length}`);
  }

  const best = chooseBest(cards);
  console.log(`nhk-anyway:v3 matched-members=${best.size}`);

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
  console.log(`nhk-anyway:v3 complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
