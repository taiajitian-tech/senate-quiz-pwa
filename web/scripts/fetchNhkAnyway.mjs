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
  "https://www3.nhk.or.jp/news/special/election2024/",
];
const MAX_PAGES = 40;

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
  return /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(String(value || ""));
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
  member.imageSource = found.source || "nhk-html-alt";
  member.imageSourceUrl = found.sourceUrl || found.pageUrl || found.url;
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

function collectImageCandidates($, pageUrl) {
  const items = [];
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
      const value = String(raw || "").trim();
      if (!value) continue;
      const first = value.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
      const url = normalizeUrl(first, pageUrl);
      if (url && looksLikeImageUrl(url)) {
        imgUrl = url;
        break;
      }
    }
    if (!imgUrl) return;

    const alt = normalizeSpace(attrs.alt || "");
    const cleanAlt = cleanName(alt);
    if (!cleanAlt) return;

    items.push({
      clean: cleanAlt,
      rawAlt: alt,
      url: imgUrl,
      source: "nhk-html-alt",
      sourceUrl: pageUrl,
      pageUrl,
    });
  });
  return items;
}

function collectLinks($, pageUrl) {
  const links = new Set();
  $("a[href]").each((_, el) => {
    const href = normalizeUrl($(el).attr("href") || "", pageUrl);
    if (!href) return;
    if (!/^https?:\/\//i.test(href)) return;
    if (/^https:\/\/news\.web\.nhk\/senkyo\/database\/shugiin\//i.test(href)) {
      links.add(href);
      return;
    }
    if (/^https:\/\/www3\.nhk\.or\.jp\/news\/special\/election2024\//i.test(href)) {
      links.add(href);
    }
  });
  return [...links];
}

async function crawlNhk(targetMap) {
  const queue = [...START_URLS];
  const seen = new Set();
  const matches = [];
  let visitedPages = 0;

  while (queue.length && visitedPages < MAX_PAGES) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const html = await fetchText(url);
      visitedPages += 1;
      console.log(`nhk-anyway page=${url} bytes=${html.length}`);
      const $ = cheerio.load(html);

      const found = collectImageCandidates($, url).filter((item) => targetMap.has(item.clean));
      console.log(`nhk-anyway page-matches=${found.length}`);
      matches.push(...found);

      const links = collectLinks($, url);
      for (const link of links) {
        if (!seen.has(link)) queue.push(link);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`nhk-anyway page-failed=${url} error=${message}`);
    }
  }

  return { visitedPages, matches };
}

function chooseBest(matches) {
  const best = new Map();
  for (const item of matches) {
    const current = best.get(item.clean);
    if (!current) {
      best.set(item.clean, item);
      continue;
    }
    const currentUrl = String(current.url || "");
    const nextUrl = String(item.url || "");
    const currentScore = (/photo\//i.test(currentUrl) ? 2 : 0) + (/news\.web\.nhk/i.test(current.sourceUrl || "") ? 1 : 0);
    const nextScore = (/photo\//i.test(nextUrl) ? 2 : 0) + (/news\.web\.nhk/i.test(item.sourceUrl || "") ? 1 : 0);
    if (nextScore > currentScore) best.set(item.clean, item);
  }
  return best;
}

async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetMap = new Map(
    targets
      .map((member) => [cleanName(member.name), member.name])
      .filter(([key]) => Boolean(key)),
  );

  console.log(`nhk-anyway mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);
  if (!targets.length) {
    console.log("nhk-anyway nothing-to-process");
    return;
  }

  const { visitedPages, matches } = await crawlNhk(targetMap);
  console.log(`nhk-anyway visited-pages=${visitedPages}`);
  console.log(`nhk-anyway raw-matches=${matches.length}`);

  const best = chooseBest(matches);
  console.log(`nhk-anyway unique-matches=${best.size}`);

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
  console.log(`nhk-anyway complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
