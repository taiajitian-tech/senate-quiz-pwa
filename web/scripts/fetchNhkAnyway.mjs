import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const SEARCH_TARGETS_PATH = path.resolve("public/data/representatives-image-search-targets.json");
const MISSING_PATH = path.resolve("public/data/missing-images.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();

const NHK_URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html",
  "https://www3.nhk.or.jp/news/special/election2024/",
];

const EXTRA_NAME_ALIASES = {
  "安藤たかお": ["安藤高夫"],
};

function normalizeSpace(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return normalizeSpace(String(value ?? ""))
    .normalize("NFKC")
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/[()（）「」『』［］【】〔〕]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[‐‑‒–—―ー－\-]/g, "")
    .replace(/君$/u, "")
    .trim();
}

function normalizeKana(value = "") {
  return cleanName(value).replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
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

function looksLikeImageUrl(url = "") {
  return /^https?:\/\//i.test(url) && /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(url);
}

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function pickTargets(members) {
  const fixTargets = readJsonIfExists(FIX_TARGETS_PATH, []);
  if (Array.isArray(fixTargets) && fixTargets.length > 0) {
    const names = [...new Set(fixTargets.map((item) => cleanName(item?.name || "")).filter(Boolean))];
    return { mode: "fix", names };
  }

  const searchTargets = readJsonIfExists(SEARCH_TARGETS_PATH, []);
  if (Array.isArray(searchTargets) && searchTargets.length > 0) {
    const names = [...new Set(searchTargets.map((item) => cleanName(item?.name || "")).filter(Boolean))];
    return { mode: "missing", names };
  }

  const missingTargets = readJsonIfExists(MISSING_PATH, []);
  if (Array.isArray(missingTargets) && missingTargets.length > 0) {
    const names = [...new Set(missingTargets.map((item) => cleanName(item?.name || "")).filter(Boolean))];
    return { mode: "missing", names };
  }

  const names = members
    .filter((member) => !normalizeSpace(member?.image || ""))
    .map((member) => cleanName(member?.name || ""))
    .filter(Boolean);

  return { mode: "missing", names: [...new Set(names)] };
}

function buildAliases(member) {
  const raw = new Set();
  const add = (value) => {
    const v = normalizeSpace(value || "");
    if (v) raw.add(v);
  };

  add(member?.name);
  add(member?.kana);
  add(member?.furigana);
  add(member?.yomi);
  add(member?.yomigana);
  add(member?.displayName);
  add(member?.formalName);
  add(member?.profileName);

  for (const extra of EXTRA_NAME_ALIASES[normalizeSpace(member?.name || "")] || []) {
    add(extra);
  }

  const exact = new Set();
  const kana = new Set();

  for (const value of raw) {
    const c = cleanName(value);
    if (c) exact.add(c);
    const k = normalizeKana(value);
    if (k) kana.add(k);
  }

  return {
    raw: [...raw],
    exact,
    kana,
  };
}

function buildTargetIndex(members, targetNames) {
  const targetSet = new Set(targetNames);
  const byExact = new Map();
  const byKana = new Map();
  const targetMembers = [];

  for (const member of members) {
    const memberName = cleanName(member?.name || "");
    if (!targetSet.has(memberName) && TARGET_MODE !== "all") continue;

    const aliases = buildAliases(member);
    const target = { member, memberName, aliases };
    targetMembers.push(target);

    for (const key of aliases.exact) {
      if (!byExact.has(key)) byExact.set(key, []);
      byExact.get(key).push(target);
    }
    for (const key of aliases.kana) {
      if (!byKana.has(key)) byKana.set(key, []);
      byKana.get(key).push(target);
    }
  }

  return { targetSet, byExact, byKana, targetMembers };
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function candidateImageUrls(attrs = {}, sourceUrl = "") {
  const raws = [
    attrs.src,
    attrs["data-src"],
    attrs["data-original"],
    attrs["data-lazy-src"],
    attrs["data-srcset"],
    attrs.srcset,
  ];

  const urls = [];
  for (const raw of raws) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const first = value.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, sourceUrl);
    if (url && looksLikeImageUrl(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

function scoreImage(url = "", attrs = {}, context = "") {
  const hay = `${url} ${attrs.alt || ""} ${attrs.class || ""} ${attrs.id || ""} ${context}`.toLowerCase();
  let score = 0;
  if (/photo|portrait|profile|member|giin|candidate|face|kao/.test(hay)) score += 6;
  if (/logo|icon|banner|btn|button|sprite|thumb-default/.test(hay)) score -= 12;
  if (/party|政党/.test(hay)) score -= 4;
  return score;
}

function collectNhkMatches(html = "", pageUrl = "", indexes) {
  const { byExact, byKana } = indexes;
  const $ = cheerio.load(html);
  const found = [];

  $("img").each((_, el) => {
    const attrs = el.attribs || {};
    const urls = candidateImageUrls(attrs, pageUrl);
    if (urls.length === 0) return;

    const container = $(el).closest("a, li, article, section, tr, div");
    const text = normalizeSpace(`${attrs.alt || ""} ${attrs.title || ""} ${container.text() || ""}`);
    const exactTokens = [cleanName(text), cleanName(attrs.alt || ""), cleanName(attrs.title || "")].filter(Boolean);
    const kanaTokens = [normalizeKana(text), normalizeKana(attrs.alt || ""), normalizeKana(attrs.title || "")].filter(Boolean);

    const matchedTargets = new Set();
    for (const token of exactTokens) {
      const items = byExact.get(token) || [];
      for (const item of items) matchedTargets.add(item);
    }
    for (const token of kanaTokens) {
      const items = byKana.get(token) || [];
      for (const item of items) matchedTargets.add(item);
    }

    if (matchedTargets.size !== 1) return;

    const target = [...matchedTargets][0];
    const bestUrl = urls
      .map((url) => ({ url, score: scoreImage(url, attrs, text) }))
      .sort((a, b) => b.score - a.score)[0]?.url;

    if (!bestUrl) return;

    found.push({
      memberName: target.memberName,
      url: bestUrl,
      source: "nhk-html-img",
      sourceUrl: pageUrl,
      text,
    });
  });

  return found;
}

function firstMetaImage($, pageUrl) {
  const candidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ];

  for (const raw of candidates) {
    const url = normalizeUrl(raw, pageUrl);
    if (url && looksLikeImageUrl(url)) return url;
  }
  return "";
}

function collectProfilePageImage(html = "", pageUrl = "") {
  const $ = cheerio.load(html);
  const meta = firstMetaImage($, pageUrl);
  if (meta) return meta;

  const scored = [];
  $("img").each((_, el) => {
    const attrs = el.attribs || {};
    const urls = candidateImageUrls(attrs, pageUrl);
    const context = normalizeSpace($(el).closest("main, article, section, div").text() || "");
    for (const url of urls) {
      scored.push({
        url,
        score: scoreImage(url, attrs, context),
      });
    }
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .find((item) => item.score >= 0)?.url || "";
}

function markResolved(member, found) {
  member.image = found.url;
  member.imageSource = found.source || "profile-page";
  member.imageSourceUrl = found.sourceUrl || found.url;
  member.aiGuess = false;
  member.sourceType = "verified";
  member.imageMaskBottom = false;
  member.imageMaskMode = "none";
}

async function tryProfileFallback(target) {
  const urls = [
    normalizeUrl(target.member?.profileUrl || ""),
    normalizeUrl(target.member?.imageSourceUrl || ""),
  ].filter(Boolean);

  for (const pageUrl of [...new Set(urls)]) {
    try {
      const html = await fetchText(pageUrl);
      const bytes = Buffer.byteLength(html, "utf8");
      console.log(`nhk-anyway fallback-page=${pageUrl} bytes=${bytes}`);

      const image = collectProfilePageImage(html, pageUrl);
      if (!image) continue;

      return {
        memberName: target.memberName,
        url: image,
        source: "profile-page",
        sourceUrl: pageUrl,
      };
    } catch (error) {
      console.log(`nhk-anyway fallback-failed=${pageUrl} error=${error?.message ?? String(error)}`);
    }
  }
  return null;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`representatives.json not found: ${DATA_PATH}`);
  }

  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const picked = pickTargets(members);
  const mode = picked.mode;
  const indexes = buildTargetIndex(members, picked.names);

  console.log(`nhk-anyway mode=${mode} total=${members.length} targets=${indexes.targetSet.size}`);

  let visitedPages = 0;
  let rawMatches = 0;
  const bestByName = new Map();

  for (const pageUrl of NHK_URLS) {
    try {
      const html = await fetchText(pageUrl);
      const bytes = Buffer.byteLength(html, "utf8");
      console.log(`nhk-anyway page=${pageUrl} bytes=${bytes}`);

      const matches = collectNhkMatches(html, pageUrl, indexes);
      console.log(`nhk-anyway page-matches=${matches.length}`);

      for (const item of matches) {
        rawMatches += 1;
        if (!bestByName.has(item.memberName)) bestByName.set(item.memberName, item);
      }
      visitedPages += 1;
    } catch (error) {
      console.log(`nhk-anyway page-failed=${pageUrl} error=${error?.message ?? String(error)}`);
    }
  }

  console.log(`nhk-anyway visited-pages=${visitedPages}`);
  console.log(`nhk-anyway raw-matches=${rawMatches}`);
  console.log(`nhk-anyway unique-matches=${bestByName.size}`);

  for (const target of indexes.targetMembers) {
    if (bestByName.has(target.memberName)) continue;
    const fallback = await tryProfileFallback(target);
    if (!fallback) continue;
    bestByName.set(target.memberName, fallback);
    console.log(`nhk-anyway fallback-hit=${target.memberName}`);
  }

  let filled = 0;
  for (const target of indexes.targetMembers) {
    const found = bestByName.get(target.memberName);
    if (!found) continue;

    if (!normalizeSpace(target.member?.image || "") || mode === "fix" || TARGET_MODE === "all") {
      markResolved(target.member, found);
      filled += 1;
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(members, null, 2));

  const stillMissing = [];
  for (const target of indexes.targetMembers) {
    if (!normalizeSpace(target.member?.image || "")) {
      stillMissing.push(target.memberName);
      console.log(`missing: ${target.memberName}`);
    }
  }

  console.log(`nhk-anyway complete mode=${mode} filled=${filled} still-missing=${stillMissing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
