
import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();

const ORIGIN = "https://news.web.nhk";
const YEAR = "2026";
const DATA_ROOTS = [
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/`,
  `${ORIGIN}/senkyo-data/database/shugiin/00/`,
  `${ORIGIN}/senkyo/database/shugiin/00/`,
];
const SEED_URLS = [
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/sindex.csv`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/hindex.csv`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/stindex.csv`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/area.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/default.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/index.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/const.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/senkyoPhase.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/management.json`,
  `${ORIGIN}/senkyo-data/database/shugiin/${YEAR}/00/senkyoNews.json`,
];

const PHOTO_URL_RE = /https?:\/\/news\.web\.nhk\/senkyo-data\/database\/shugiin\/\d{4}\/\d{2}\/\d+\/photo\/[^"'`\s,<>]+?\.(?:jpg|jpeg|png|webp)/gi;
const REL_PHOTO_RE = /\/senkyo-data\/database\/shugiin\/\d{4}\/\d{2}\/\d+\/photo\/[^"'`\s,<>]+?\.(?:jpg|jpeg|png|webp)/gi;

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

function looksLikeNhk(url = "") {
  return /^https:\/\/news\.web\.nhk\/senkyo(?:-data)?\//i.test(url);
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
  member.imageSource = found.source || "nhk-static-assets";
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
      "accept": "text/html,application/json,text/javascript,text/csv,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractUrlsFromText(text = "", baseUrl = "") {
  const out = new Set();

  const add = (value) => {
    const url = normalizeUrl(value, baseUrl);
    if (!url || !looksLikeNhk(url)) return;
    out.add(url);
  };

  for (const m of text.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) add(m[1]);
  for (const m of text.matchAll(/["'`]([^"'`]+(?:\.json|\.csv|\.js|\.html|\/\d{2,}\/?)[^"'`]*)["'`]/gi)) add(m[1]);
  for (const m of text.matchAll(/\/senkyo(?:-data)?\/database\/shugiin\/[^"'`\s,<>]+/gi)) add(m[0]);

  return [...out];
}

function extractAppData(text = "") {
  const m = text.match(/window\.App_SenkyoData\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

function substituteAppData(raw = "", appData = {}) {
  let s = String(raw || "");
  for (const [k, v] of Object.entries(appData || {})) {
    s = s.replaceAll(`\${${k}}`, String(v ?? ""));
    s = s.replaceAll(`{{${k}}}`, String(v ?? ""));
    s = s.replaceAll(`:${k}`, String(v ?? ""));
  }
  return s;
}

function tryParseJsonish(text = "") {
  try {
    return JSON.parse(text);
  } catch {}
  const m = text.match(/^\s*(?:window\.[A-Za-z0-9_$.]+\s*=\s*)?(\{[\s\S]*\}|\[[\s\S]*\])\s*;?\s*$/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch {}
  }
  return null;
}

function collectCardsFromHtml(html = "", sourceUrl = "", targetNames = []) {
  const cards = [];
  const $ = cheerio.load(html);
  $("img").each((_, el) => {
    const attrs = el.attribs || {};
    const candidates = [attrs.src, attrs["data-src"], attrs["data-original"], attrs["data-lazy-src"], attrs.srcset, attrs["data-srcset"], attrs["data-lazy-srcset"]];
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

    const containerText = normalizeSpace($(el).closest("div,li,article,section,tr,a").text() || "");
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

function collectCardsFromFreeText(text = "", sourceUrl = "", targetNames = []) {
  const cards = [];
  const allUrls = [
    ...(text.match(PHOTO_URL_RE) || []),
    ...(text.match(REL_PHOTO_RE) || []).map((p) => normalizeUrl(p, ORIGIN)),
  ];

  for (const rawUrl of allUrls) {
    const idx = text.indexOf(rawUrl);
    if (idx < 0) continue;
    const windowStart = Math.max(0, idx - 1200);
    const windowEnd = Math.min(text.length, idx + rawUrl.length + 1200);
    const nearby = normalizeSpace(text.slice(windowStart, windowEnd).replace(/<[^>]+>/g, " "));
    const hay = cleanName(nearby);
    const matches = targetNames.filter((item) => hay.includes(item.clean));
    if (matches.length !== 1) continue;

    cards.push({
      name: matches[0].raw,
      clean: matches[0].clean,
      url: normalizeUrl(rawUrl, ORIGIN),
      source: "nhk-text-photo",
      sourceUrl,
      width: 0,
      height: 0,
      text: nearby,
    });
  }
  return cards;
}

function collectCardsFromCsv(text = "", sourceUrl = "", targetNames = []) {
  const cards = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (!line.trim()) continue;
    const hay = cleanName(line);
    const photo = (line.match(PHOTO_URL_RE)?.[0]) || normalizeUrl((line.match(REL_PHOTO_RE)?.[0]) || "", ORIGIN);
    if (!photo || !looksLikeImageUrl(photo)) continue;
    const matches = targetNames.filter((item) => hay.includes(item.clean));
    if (matches.length !== 1) continue;

    cards.push({
      name: matches[0].raw,
      clean: matches[0].clean,
      url: photo,
      source: "nhk-csv",
      sourceUrl,
      width: 0,
      height: 0,
      text: line,
    });
  }
  return cards;
}

function collectCardsFromJson(root, sourceUrl = "", targetNames = [], out = []) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const entries = Object.entries(node);
    const stringValues = entries
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, normalizeSpace(value)]);

    const hay = cleanName(stringValues.map(([, value]) => value).join(" "));
    const imageCandidates = stringValues
      .map(([, value]) => normalizeUrl(value, sourceUrl))
      .filter((value) => looksLikeImageUrl(value));

    if (hay && imageCandidates.length) {
      const matches = targetNames.filter((item) => hay.includes(item.clean));
      if (matches.length === 1) {
        out.push({
          name: matches[0].raw,
          clean: matches[0].clean,
          url: imageCandidates[0],
          source: "nhk-json",
          sourceUrl,
          width: Number(node.width || node.img_width || node.image_width || 0),
          height: Number(node.height || node.img_height || node.image_height || 0),
          text: stringValues.map(([key, value]) => `${key}:${value}`).join(" "),
        });
      }
    }

    for (const [, value] of entries) {
      if (typeof value === "object" && value !== null) walk(value);
    }
  };
  walk(root);
  return out;
}

function chooseBest(cards) {
  const byName = new Map();
  for (const card of cards) {
    let score = 0;
    if ((card.width || 0) >= 120) score += 6;
    if ((card.height || 0) >= 120) score += 6;
    if (/当選|当確|比例|小選挙区|自民|維新|国民|共産|参政|みらい|中道/u.test(card.text || "")) score += 4;
    if (/nhk-json/.test(card.source || "")) score += 3;
    if (/nhk-csv/.test(card.source || "")) score += 3;
    if (/nhk-html-img/.test(card.source || "")) score += 2;
    const current = byName.get(card.clean);
    if (!current || score > current.score) byName.set(card.clean, { ...card, score });
  }
  return byName;
}

async function crawlNhkStatic(targetNames) {
  const visited = new Set();
  const queued = new Set(SEED_URLS);
  const queue = [...SEED_URLS];
  const cards = [];

  while (queue.length) {
    const url = queue.shift();
    queued.delete(url);
    if (!url || visited.has(url) || !looksLikeNhk(url)) continue;
    visited.add(url);

    try {
      const text = await fetchText(url);
      console.log(`nhk-static:v2 page=${url} bytes=${text.length}`);

      cards.push(...collectCardsFromHtml(text, url, targetNames));
      cards.push(...collectCardsFromFreeText(text, url, targetNames));
      if (/\.csv(\?|$)/i.test(url)) cards.push(...collectCardsFromCsv(text, url, targetNames));

      const parsed = tryParseJsonish(text);
      if (parsed) {
        const found = collectCardsFromJson(parsed, url, targetNames, []);
        cards.push(...found);
        if (found.length) console.log(`nhk-static:v2 json=${url} matched=${found.length}`);
      }

      const appData = extractAppData(text);
      const discovered = extractUrlsFromText(substituteAppData(text, appData), url);
      for (const next of discovered) {
        if (!visited.has(next) && !queued.has(next)) {
          queue.push(next);
          queued.add(next);
        }
      }

      for (const root of DATA_ROOTS) {
        for (const name of ["sindex.csv", "hindex.csv", "stindex.csv", "area.json", "default.json", "index.json", "const.json", "senkyoPhase.json", "management.json", "senkyoNews.json"]) {
          const next = normalizeUrl(name, root);
          if (!visited.has(next) && !queued.has(next)) {
            queue.push(next);
            queued.add(next);
          }
        }
      }
    } catch (error) {
      console.log(`nhk-static:v2 fetch-failed url=${url} reason=${error?.message || "unknown"}`);
    }
  }

  return { visitedPages: visited.size, cards };
}

async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetNames = targets.map((member) => ({ raw: member.name, clean: cleanName(member.name) })).filter((x) => x.clean);

  console.log(`nhk-static:v2 mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);

  if (!targets.length) {
    console.log("nhk-static:v2 nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhkStatic(targetNames);
  console.log(`nhk-static:v2 visited-pages=${visitedPages}`);
  console.log(`nhk-static:v2 raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    throw new Error(`NHK static scrape failed: visitedPages=${visitedPages} cards=${cards.length}`);
  }

  const best = chooseBest(cards);
  console.log(`nhk-static:v2 matched-members=${best.size}`);

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
  console.log(`nhk-static:v2 complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
