import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const ORIGIN = "https://www3.nhk.or.jp";

const SEED_URLS = [
  `${ORIGIN}/news/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/news/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
];

function normalizeSpace(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return String(value ?? "").replace(/\s+/g, "").trim();
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
    return new Set(
      (Array.isArray(items) ? items : [])
        .map((item) => cleanName(item?.name || ""))
        .filter(Boolean)
    );
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
      accept: "text/html,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return await res.text();
}

function pickNameFromCard($, container) {
  const selectors = [
    ".candidate_name",
    ".name",
    ".candidate-profile__name",
    ".candidateProfile__name",
    "[class*=candidate_name]",
    "[class*=candidateName]",
  ];

  for (const selector of selectors) {
    const text = normalizeSpace($(container).find(selector).first().text());
    if (text) return text;
  }

  const profile = $(container).find(".candidate_profile").first();
  if (profile.length) {
    const cloned = profile.clone();
    cloned.find("img, picture, source, svg, script, style, noscript").remove();
    const text = normalizeSpace(cloned.text());
    if (text) return text.split(/\s+/).find(Boolean) || text;
  }

  return "";
}

function pickImageFromCard($, container, baseUrl) {
  const imageNode = $(container)
    .find(".candidate_profile .kao img, .candidate_profile img, .kao img, img")
    .first();

  if (!imageNode.length) return "";

  const attrs = imageNode.get(0)?.attribs || {};
  const candidates = [
    attrs.src,
    attrs["data-src"],
    attrs["data-original"],
    attrs["data-lazy-src"],
    attrs.srcset,
    attrs["data-srcset"],
    attrs["data-lazy-srcset"],
  ];

  for (const raw of candidates) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const first = value.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, baseUrl);
    if (url && looksLikeImageUrl(url)) return url;
  }

  return "";
}

function collectCardsFromHtml(html = "", sourceUrl = "") {
  const $ = cheerio.load(html);
  const results = [];

  $(".candidate").each((_, el) => {
    const container = $(el);
    const name = cleanName(pickNameFromCard($, container));
    const url = pickImageFromCard($, container, sourceUrl);
    if (!name || !url) return;

    results.push({
      name,
      clean: name,
      url,
      source: "nhk-card",
      sourceUrl,
    });
  });

  return results;
}

function chooseBest(cards) {
  const byName = new Map();
  for (const card of cards) {
    if (!card.clean || !card.url) continue;
    if (!byName.has(card.clean)) byName.set(card.clean, card);
  }
  return byName;
}

async function crawlNhk() {
  const cards = [];
  let visitedPages = 0;

  for (const url of [...new Set(SEED_URLS)]) {
    try {
      const html = await fetchText(url);
      const found = collectCardsFromHtml(html, url);
      visitedPages += 1;
      console.log(`nhk-card page=${url} bytes=${html.length} cards=${found.length}`);
      cards.push(...found);
      if (found.length > 0) break;
    } catch (error) {
      console.log(`nhk-card page-failed=${url} reason=${error?.message || error}`);
    }
  }

  return { visitedPages, cards };
}

async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetSet = new Set(targets.map((member) => cleanName(member.name)).filter(Boolean));

  console.log(`nhk-card mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log("nhk-card nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhk();
  console.log(`nhk-card visited-pages=${visitedPages}`);
  console.log(`nhk-card raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    throw new Error(`NHK card scrape failed: visitedPages=${visitedPages} cards=${cards.length}`);
  }

  const filteredCards = cards.filter((card) => targetSet.has(card.clean));
  const best = chooseBest(filteredCards);
  console.log(`nhk-card matched-members=${best.size}`);

  let filled = 0;
  let stillMissing = 0;
  for (const member of targets) {
    const found = best.get(cleanName(member.name));
    if (found?.url) {
      markResolved(member, found);
      filled += 1;
      console.log(`filled: ${member.name} -> ${found.url}`);
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
