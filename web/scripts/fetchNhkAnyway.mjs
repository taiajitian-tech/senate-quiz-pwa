import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const SEARCH_TARGETS_PATH = path.resolve("public/data/representatives-image-search-targets.json");
const MISSING_PATH = path.resolve("public/data/missing-images.json");

const ENTRY_URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html",
  "https://www3.nhk.or.jp/news/special/election2024/",
];

const EXTRA_NAME_ALIASES = {
  "安藤たかお": ["安藤高夫"],
};

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

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

function shouldSkipImage(url = "", context = "") {
  const hay = `${url} ${context}`.toLowerCase();
  return /logo|icon|banner|btn|button|sprite|loading|no-photo|spacer|blank/.test(hay);
}

function readTargets(members) {
  const fixTargets = readJsonIfExists(FIX_TARGETS_PATH, []);
  if (Array.isArray(fixTargets) && fixTargets.length > 0) {
    return {
      mode: "fix",
      names: [...new Set(fixTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  const searchTargets = readJsonIfExists(SEARCH_TARGETS_PATH, []);
  if (Array.isArray(searchTargets) && searchTargets.length > 0) {
    return {
      mode: "missing",
      names: [...new Set(searchTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  const missingTargets = readJsonIfExists(MISSING_PATH, []);
  if (Array.isArray(missingTargets) && missingTargets.length > 0) {
    return {
      mode: "missing",
      names: [...new Set(missingTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  return {
    mode: "missing",
    names: [...new Set(
      members
        .filter((m) => !normalizeSpace(m?.image || ""))
        .map((m) => cleanName(m?.name || ""))
        .filter(Boolean)
    )],
  };
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

  for (const alias of EXTRA_NAME_ALIASES[normalizeSpace(member?.name || "")] || []) {
    add(alias);
  }

  const exact = new Set();
  const kana = new Set();

  for (const value of raw) {
    const c = cleanName(value);
    if (c) exact.add(c);
    const k = normalizeKana(value);
    if (k) kana.add(k);
  }

  return { exact, kana };
}

function buildTargetIndex(members, targetNames) {
  const targetSet = new Set(targetNames);
  const byExact = new Map();
  const byKana = new Map();
  const targetMembers = [];

  for (const member of members) {
    const memberName = cleanName(member?.name || "");
    if (!targetSet.has(memberName)) continue;

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

  return { targetMembers, byExact, byKana, targetSet };
}

function matchTarget(rawName, indexes) {
  const matched = new Set();

  const exact = cleanName(rawName);
  if (exact) {
    for (const item of indexes.byExact.get(exact) || []) matched.add(item);
  }

  const kana = normalizeKana(rawName);
  if (kana) {
    for (const item of indexes.byKana.get(kana) || []) matched.add(item);
  }

  return matched.size === 1 ? [...matched][0] : null;
}

async function fetchHtml(url) {
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

function candidateImageUrls(attrs = {}, base = "") {
  const raws = [
    attrs.src,
    attrs["data-src"],
    attrs["data-original"],
    attrs["data-lazy-src"],
    attrs["data-srcset"],
    attrs.srcset,
  ];

  const out = [];
  for (const raw of raws) {
    const value = String(raw || "").trim();
    if (!value) continue;
    const first = value.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, base);
    if (looksLikeImageUrl(url)) out.push(url);
  }
  return [...new Set(out)];
}

function scoreImage(url = "", attrs = {}, context = "") {
  const hay = `${url} ${attrs.alt || ""} ${attrs.class || ""} ${attrs.id || ""} ${context}`.toLowerCase();
  let score = 0;
  if (/photo|portrait|profile|member|candidate|win|face|kao/.test(hay)) score += 8;
  if (/logo|icon|banner|btn|button|sprite|loading/.test(hay)) score -= 20;
  if (/no-photo|default/.test(hay)) score -= 30;
  return score;
}

function collectNhkLinks(html = "", baseUrl = "") {
  const $ = cheerio.load(html);
  const urls = new Set();

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const url = normalizeUrl(href, baseUrl);
    if (!url) return;
    if (/^https:\/\/news\.web\.nhk\/senkyo\/database\/shugiin\/\d{2}\/(?:tousen_toukaku_senkyoku|tousen_toukaku_hirei)\.html$/i.test(url)) {
      urls.add(url);
    }
  });

  const raw = html.match(/https:\/\/news\.web\.nhk\/senkyo\/database\/shugiin\/\d{2}\/(?:tousen_toukaku_senkyoku|tousen_toukaku_hirei)\.html/g) || [];
  for (const item of raw) urls.add(item);

  return [...urls];
}

function collectDirectAltMatches(html = "", pageUrl = "", indexes) {
  const $ = cheerio.load(html);
  const found = [];

  $("img[alt]").each((_, el) => {
    const attrs = el.attribs || {};
    const target = matchTarget(attrs.alt || "", indexes);
    if (!target) return;

    const best = candidateImageUrls(attrs, pageUrl)
      .map((url) => ({ url, score: scoreImage(url, attrs, attrs.alt || "") }))
      .sort((a, b) => b.score - a.score)[0];

    if (!best) return;
    if (shouldSkipImage(best.url, attrs.alt || "")) return;

    found.push({
      memberName: target.memberName,
      image: best.url,
      sourceUrl: pageUrl,
      source: "nhk-direct-alt",
      score: best.score,
    });
  });

  return found;
}

function collectBlockMatches(html = "", pageUrl = "", indexes) {
  const $ = cheerio.load(html);
  const found = [];
  const selectors = [
    ".senkyoku-result__result-item",
    ".hirei-result__result-item",
    ".candidate_set .candidate",
    ".candidate",
    ".candidate_profile",
    "li",
    "article",
  ];

  const seen = new Set();

  for (const selector of selectors) {
    $(selector).each((_, node) => {
      const block = $(node);
      const key = `${selector}:${cleanName(block.text()).slice(0, 80)}`;
      if (!key || key.endsWith(":")) return;
      if (seen.has(key)) return;
      seen.add(key);

      const rawTexts = new Set();
      const pushText = (v) => {
        const t = normalizeSpace(v || "");
        if (t) rawTexts.add(t);
      };

      pushText(block.text());
      block.find("*").each((__, child) => {
        const el = $(child);
        pushText(el.attr("alt"));
        pushText(el.attr("title"));
        pushText(el.attr("aria-label"));
      });

      let target = null;
      for (const raw of rawTexts) {
        target = matchTarget(raw, indexes);
        if (target) break;
      }
      if (!target) return;

      const scored = [];
      block.find("img").each((__, img) => {
        const attrs = img.attribs || {};
        for (const url of candidateImageUrls(attrs, pageUrl)) {
          scored.push({ url, score: scoreImage(url, attrs, [...rawTexts].join(" ")) });
        }
      });

      const best = scored.sort((a, b) => b.score - a.score)[0];
      if (!best) return;
      if (shouldSkipImage(best.url, [...rawTexts].join(" "))) return;

      found.push({
        memberName: target.memberName,
        image: best.url,
        sourceUrl: pageUrl,
        source: "nhk-block",
        score: best.score,
      });
    });
  }

  return found;
}

function collectProfilePageImage(html = "", pageUrl = "") {
  const $ = cheerio.load(html);

  const metaCandidates = [
    $('meta[property="og:image"]').attr("content"),
    $('meta[name="twitter:image"]').attr("content"),
    $('link[rel="image_src"]').attr("href"),
  ];

  for (const raw of metaCandidates) {
    const url = normalizeUrl(raw, pageUrl);
    if (url && looksLikeImageUrl(url) && !shouldSkipImage(url)) return url;
  }

  const scored = [];
  $("img").each((_, img) => {
    const attrs = img.attribs || {};
    const context = normalizeSpace($(img).closest("main, article, section, div").text() || "");
    for (const url of candidateImageUrls(attrs, pageUrl)) {
      scored.push({ url, score: scoreImage(url, attrs, context) });
    }
  });

  return scored.sort((a, b) => b.score - a.score).find((item) => item.score >= 0)?.url || "";
}

async function buildNhkPages() {
  const queue = [...ENTRY_URLS];
  const seen = new Set();
  const pages = [];

  while (queue.length > 0) {
    const url = queue.shift();
    if (!url || seen.has(url)) continue;
    seen.add(url);

    try {
      const html = await fetchHtml(url);
      pages.push({ url, html });

      const discovered = collectNhkLinks(html, url);
      for (const next of discovered) {
        if (!seen.has(next)) queue.push(next);
      }
    } catch (error) {
      console.log(`rep-image nhk-seed-failed url=${url} error=${error?.message ?? String(error)}`);
    }
  }

  return pages;
}

async function tryProfileFallback(target) {
  const urls = [
    normalizeUrl(target.member?.imageSourceUrl || ""),
    normalizeUrl(target.member?.profileUrl || ""),
  ].filter(Boolean);

  for (const pageUrl of [...new Set(urls)]) {
    try {
      const html = await fetchHtml(pageUrl);
      const image = collectProfilePageImage(html, pageUrl);
      if (!image) continue;
      return {
        memberName: target.memberName,
        image,
        sourceUrl: pageUrl,
        source: "profile-page",
        score: 0,
      };
    } catch (error) {
      console.log(`rep-image profile-failed name=${target.member.name} url=${pageUrl} error=${error?.message ?? String(error)}`);
    }
  }

  return null;
}

function applyFound(member, found) {
  member.image = found.image;
  member.imageSource = found.source === "profile-page" ? "profile-page" : "nhk";
  member.imageSourceUrl = found.sourceUrl;
  member.sourceType = found.source === "profile-page" ? "profile-fixed" : "nhk-fixed";
  member.imageMaskBottom = false;
  member.imageMaskMode = "none";
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`representatives.json not found: ${DATA_PATH}`);
  }

  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const targetInfo = readTargets(members);
  const indexes = buildTargetIndex(members, targetInfo.names);

  console.log(`rep-image mode=${targetInfo.mode} total=${members.length} targets=${indexes.targetMembers.length}`);

  const nhkPages = await buildNhkPages();
  console.log(`rep-image nhk-pages=${nhkPages.length}`);

  const bestByName = new Map();

  for (const page of nhkPages) {
    const direct = collectDirectAltMatches(page.html, page.url, indexes);
    const block = collectBlockMatches(page.html, page.url, indexes);

    console.log(`rep-image nhk-page url=${page.url} direct=${direct.length} block=${block.length}`);

    for (const item of [...direct, ...block]) {
      const prev = bestByName.get(item.memberName);
      if (!prev || item.score > prev.score) {
        bestByName.set(item.memberName, item);
      }
    }
  }

  let profileHits = 0;
  for (const target of indexes.targetMembers) {
    if (bestByName.has(target.memberName)) continue;
    const fallback = await tryProfileFallback(target);
    if (!fallback) continue;
    bestByName.set(target.memberName, fallback);
    profileHits += 1;
    console.log(`rep-image profile-hit name=${target.member.name}`);
  }

  let replaced = 0;
  for (const target of indexes.targetMembers) {
    const found = bestByName.get(target.memberName);
    if (!found) continue;

    if (targetInfo.mode === "fix" || !normalizeSpace(target.member?.image || "")) {
      applyFound(target.member, found);
      replaced += 1;
      console.log(`replaced: ${target.member.name} <- ${found.source}`);
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(members, null, 2));

  const stillMissing = [];
  for (const target of indexes.targetMembers) {
    if ((targetInfo.mode === "fix" || !normalizeSpace(target.member?.image || "")) && !bestByName.has(target.memberName)) {
      stillMissing.push(normalizeSpace(target.member?.name || target.memberName));
      console.log(`missing: ${target.member.name}`);
    }
  }

  console.log(`rep-image complete replaced=${replaced} nhk-found=${[...bestByName.values()].filter(v => v.source !== "profile-page").length} profile-found=${profileHits} still-missing=${stillMissing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
