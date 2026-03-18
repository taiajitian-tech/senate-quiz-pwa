import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const ORIGIN = "https://news.web.nhk";
const START_URLS = [
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
  `https://www3.nhk.or.jp/news/special/election2024/`,
];
const MAX_PAGES = 120;

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}
function cleanName(value = "") {
  return normalizeSpace(String(value))
    .replace(/[ 　	
]/g, "")
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
  member.imageSource = found.source || "nhk-html-alt";
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
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}
function extractMatches(html = "", sourceUrl = "", targetMap = new Map()) {
  const results = [];
  const links = [];
  const $ = cheerio.load(html);

  $("img").each((_, el) => {
    const attrs = el.attribs || {};
    const srcCandidates = [
      attrs.src,
      attrs["data-src"],
      attrs["data-original"],
      attrs["data-lazy-src"],
      attrs.srcset,
      attrs["data-srcset"],
      attrs["data-lazy-srcset"],
    ];

    let imgUrl = "";
    for (const raw of srcCandidates) {
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

    const rawAlt = normalizeSpace(attrs.alt || "");
    const cleanAlt = cleanName(rawAlt);
    if (!cleanAlt) return;
    const memberName = targetMap.get(cleanAlt);
    if (!memberName) return;

    results.push({
      name: memberName,
      clean: cleanAlt,
      url: imgUrl,
      source: "nhk-html-alt",
      sourceUrl,
    });
  });

  $("a[href]").each((_, el) => {
    const href = normalizeUrl($(el).attr("href") || "", sourceUrl);
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    if (!/nhk\.or\.jp/.test(href)) return;
    if (/\/senkyo\/database\/shugiin\//.test(href) || /\/news\/special\/election2024\//.test(href)) {
      if (/\.html(?:\?|$)/.test(href) || /\/[^/?#]+\/?(?:\?|#|$)/.test(href)) {
        links.push(href);
      }
    }
  });

  return { results, links };
}
function chooseBest(foundItems) {
  const best = new Map();
  for (const item of foundItems) {
    if (!best.has(item.clean)) best.set(item.clean, item);
  }
  return best;
}
async function crawlNhk(targetNames) {
  const queue = [...START_URLS];
  const queued = new Set(queue);
  const visited = new Set();
  const found = [];
  const targetMap = new Map(targetNames.map((item) => [item.clean, item.raw]));

  while (queue.length && visited.size < MAX_PAGES) {
    const url = queue.shift();
    if (!url || visited.has(url)) continue;
    visited.add(url);
    try {
      const html = await fetchText(url);
      const { results, links } = extractMatches(html, url, targetMap);
      console.log(`nhk-anyway:v4 page=${url} bytes=${html.length} matches=${results.length} links=${links.length}`);
      found.push(...results);
      for (const link of links) {
        if (!queued.has(link) && !visited.has(link)) {
          queued.add(link);
          queue.push(link);
        }
      }
    } catch (error) {
      console.log(`nhk-anyway:v4 page-failed=${url} error=${error?.message || error}`);
    }
  }

  return { visitedPages: visited.size, cards: found };
}
async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetNames = targets.map((member) => ({ raw: member.name, clean: cleanName(member.name) })).filter((x) => x.clean);

  console.log(`nhk-anyway:v4 mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log("nhk-anyway:v4 nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhk(targetNames);
  console.log(`nhk-anyway:v4 visited-pages=${visitedPages}`);
  console.log(`nhk-anyway:v4 raw-cards=${cards.length}`);

  const best = chooseBest(cards);
  console.log(`nhk-anyway:v4 matched-members=${best.size}`);

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

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(members, null, 2)}
`, "utf8");
  console.log(`nhk-anyway:v4 complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
