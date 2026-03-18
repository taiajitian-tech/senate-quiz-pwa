import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { load } from "cheerio";

const dataPath = path.resolve("public/data/representatives.json");
const TIMEOUT_MS = Number(process.env.REP_IMAGE_TIMEOUT_MS || 12000);
const WAIT_MS = Number(process.env.REP_IMAGE_WAIT_MS || 80);
const CONCURRENCY = Math.max(1, Number(process.env.REP_IMAGE_CONCURRENCY || 8));
const SEARCH_RESULT_LIMIT = Math.max(4, Number(process.env.REP_IMAGE_SEARCH_LIMIT || 10));
const BATCH_LIMIT = Math.max(1, Number(process.env.REP_IMAGE_BATCH_LIMIT || 25));
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const SKIP_AI_GUESS = String(process.env.REP_IMAGE_SKIP_AI_GUESS || "false").trim().toLowerCase() === "true";
const ENABLE_TEXT_MASK = String(process.env.REP_IMAGE_ENABLE_TEXT_MASK || "true").trim().toLowerCase() !== "false";
const YOMIURI_ONLY = String(process.env.REP_IMAGE_YOMIURI_ONLY || "false").trim().toLowerCase() === "true";
const YOMIURI_REPLACE_EXISTING = String(process.env.REP_IMAGE_YOMIURI_REPLACE_EXISTING || "false").trim().toLowerCase() === "true";
const YOMIURI_REBUILD_CACHE = String(process.env.REP_IMAGE_YOMIURI_REBUILD_CACHE || (YOMIURI_ONLY ? "true" : "false")).trim().toLowerCase() === "true";
const YOMIURI_USE_BROWSER = String(process.env.REP_IMAGE_YOMIURI_USE_BROWSER || "false").trim().toLowerCase() === "true";

const MANUAL_SOURCE_PAGES_PATH = path.resolve("scripts/representativeImageSourcePages.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const MANUAL_SOURCE_PAGES = fs.existsSync(MANUAL_SOURCE_PAGES_PATH)
  ? JSON.parse(fs.readFileSync(MANUAL_SOURCE_PAGES_PATH, "utf8"))
  : {};
const FIX_TARGETS = fs.existsSync(FIX_TARGETS_PATH)
  ? JSON.parse(fs.readFileSync(FIX_TARGETS_PATH, "utf8"))
  : [];

const MANUAL_BAD_IMAGE_REMOVALS = new Set(["安藤たかお"]);
const MANUAL_OVERRIDES = {
  浅田眞澄美: {
    url: "http://asada-masumi.com/wordpress/wp-content/uploads/2011/07/sotsu2.jpg",
    source: "official-manual",
    sourceUrl: "https://asada-masumi.com/about-us/"
  }
};

const TRUSTED_FALLBACK_DOMAINS = [
  "go2senkyo.com",
  "senkyo.janjan.jp",
  "smartvote.jp",
  "politician.cafe",
  "sangiin.go.jp",
  "shugiin.go.jp"
];

const GENERAL_QUERY_VARIANTS = (name) => [
  `${name} 衆議院議員 プロフィール`,
  `${name} 政治家 プロフィール`,
  `${name} 公式`,
  `${name} wikipedia`,
  `${name} go2senkyo`
];

const YOMIURI_WINNERS_BASE_URLS = [
  "https://www.yomiuri.co.jp/election/shugiin/2026winners001/",
  "https://www.yomiuri.co.jp/election/shugiin/2026winners013/",
  "https://www.yomiuri.co.jp/election/shugiin/2026winners033/",
  "https://www.yomiuri.co.jp/election/shugiin/2026winners858/"
];

const YOMIURI_HINTS = [
  { match: /自由民主党・無所属の会|自由民主党|自民/u, urls: ["https://www.yomiuri.co.jp/election/shugiin/2026winners001/"] },
  { match: /国民民主党・無所属クラブ|国民民主党|国民/u, urls: ["https://www.yomiuri.co.jp/election/shugiin/2026winners013/"] },
  { match: /チームみらい/u, urls: ["https://www.yomiuri.co.jp/election/shugiin/2026winners033/"] },
  { match: /参政党/u, urls: ["https://www.yomiuri.co.jp/election/shugiin/2026winners858/"] }
];

const PARTY_HINTS = [
  {
    match: /自由民主党|自民/u,
    domains: ["jimin.jp"],
    queries: (name) => [`site:jimin.jp/member ${name}`, `site:jimin.jp ${name} 議員`]
  },
  {
    match: /立憲民主党|立民/u,
    domains: ["cdp-japan.jp"],
    queries: (name) => [`site:cdp-japan.jp ${name} 衆議院`, `site:cdp-japan.jp ${name}`]
  },
  {
    match: /日本維新の会|維新/u,
    domains: ["o-ishin.jp"],
    queries: (name) => [`site:o-ishin.jp ${name}`, `site:o-ishin.jp ${name} 議員`]
  },
  {
    match: /公明党/u,
    domains: ["komei.or.jp"],
    queries: (name) => [`site:komei.or.jp ${name}`, `site:komei.or.jp ${name} プロフィール`]
  },
  {
    match: /国民民主党|国民/u,
    domains: ["new-kokumin.jp"],
    queries: (name) => [`site:new-kokumin.jp ${name}`, `site:new-kokumin.jp ${name} 議員`]
  },
  {
    match: /日本共産党|共産/u,
    domains: ["jcp.or.jp"],
    queries: (name) => [`site:jcp.or.jp ${name}`, `site:jcp.or.jp ${name} 議員`]
  },
  {
    match: /れいわ新選組/u,
    domains: ["reiwa-shinsengumi.com"],
    queries: (name) => [`site:reiwa-shinsengumi.com ${name}`, `site:reiwa-shinsengumi.com ${name} プロフィール`]
  },
  {
    match: /参政党/u,
    domains: ["sanseito.jp"],
    queries: (name) => [`site:sanseito.jp ${name}`, `site:sanseito.jp ${name} 議員`]
  },
  {
    match: /社民党|社民/u,
    domains: ["sdp.or.jp"],
    queries: (name) => [`site:sdp.or.jp ${name}`, `site:sdp.or.jp ${name} プロフィール`]
  },
  {
    match: /日本保守党|保守/u,
    domains: ["hoshuto.jp"],
    queries: (name) => [`site:hoshuto.jp ${name}`, `site:hoshuto.jp ${name} 議員`]
  }
];

const jsonCache = new Map();
const htmlCache = new Map();
const searchCache = new Map();
const profilePageCache = new Map();

const SEARCH_HISTORY_PATH = path.resolve("public/data/image-search-cache.json");
const URL_HISTORY_PATH = path.resolve("public/data/representatives-image-url-cache.json");
const YOMIURI_CACHE_PATH = path.resolve("public/data/representatives-yomiuri-cache.json");

function readJsonFileSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

const persistedSearchHistory = readJsonFileSafe(SEARCH_HISTORY_PATH, {});
const persistedUrlHistory = readJsonFileSafe(URL_HISTORY_PATH, {});
let searchHistoryDirty = false;
let urlHistoryDirty = false;
let yomiuriCacheDirty = false;
const persistedYomiuriCache = readJsonFileSafe(YOMIURI_CACHE_PATH, { entries: {}, pages: {}, updatedAt: "" });
if (!persistedYomiuriCache.entries || typeof persistedYomiuriCache.entries !== "object") persistedYomiuriCache.entries = {};
if (!persistedYomiuriCache.pages || typeof persistedYomiuriCache.pages !== "object") persistedYomiuriCache.pages = {};

function ensureMemberSearchHistory(name) {
  const key = cleanName(name);
  if (!persistedSearchHistory[key] || typeof persistedSearchHistory[key] !== "object") {
    persistedSearchHistory[key] = { name: normalizeSpace(name), sources: {}, resolved: false, updatedAt: "" };
    searchHistoryDirty = true;
  }
  if (!persistedSearchHistory[key].sources || typeof persistedSearchHistory[key].sources !== "object") {
    persistedSearchHistory[key].sources = {};
    searchHistoryDirty = true;
  }
  return persistedSearchHistory[key];
}

function getSourceState(name, sourceKey) {
  const entry = ensureMemberSearchHistory(name);
  return String(entry.sources?.[sourceKey] || "");
}

function setSourceState(name, sourceKey, state) {
  const entry = ensureMemberSearchHistory(name);
  if (entry.sources[sourceKey] === state) return;
  entry.sources[sourceKey] = state;
  entry.updatedAt = new Date().toISOString();
  if (state === "success") entry.resolved = true;
  searchHistoryDirty = true;
}

function shouldSkipSource(name, sourceKey) {
  const state = getSourceState(name, sourceKey);
  return state === "not_found";
}

function inferBlockedUrlReason(url = "") {
  const text = String(url).toLowerCase();
  if (!text) return "";
  if (/logo/.test(text)) return "logo";
  if (/poster|leaflet|flyer|manifesto|senkyo/.test(text)) return "poster";
  if (/group|集合|allmember|members/.test(text)) return "group-photo";
  if (/text|policy|profile_pdf|pdf/.test(text)) return "text-heavy";
  return "";
}

function markUrlState(url, state, reason = "") {
  if (!url) return;
  const prev = persistedUrlHistory[url] || {};
  if (prev.state === state && prev.reason === reason) return;
  persistedUrlHistory[url] = { state, reason, updatedAt: new Date().toISOString() };
  urlHistoryDirty = true;
}

function shouldSkipUrl(url = "") {
  if (!url) return true;
  const blocked = inferBlockedUrlReason(url);
  if (blocked) {
    markUrlState(url, "blocked", blocked);
    return true;
  }
  const state = persistedUrlHistory[url]?.state;
  return state === "not_found" || state === "blocked";
}

function flushPersistentCaches() {
  if (searchHistoryDirty) {
    fs.writeFileSync(SEARCH_HISTORY_PATH, `${JSON.stringify(persistedSearchHistory, null, 2)}
`, "utf8");
    searchHistoryDirty = false;
  }
  if (urlHistoryDirty) {
    fs.writeFileSync(URL_HISTORY_PATH, `${JSON.stringify(persistedUrlHistory, null, 2)}
`, "utf8");
    urlHistoryDirty = false;
  }
  if (yomiuriCacheDirty) {
    persistedYomiuriCache.updatedAt = new Date().toISOString();
    fs.writeFileSync(YOMIURI_CACHE_PATH, `${JSON.stringify(persistedYomiuriCache, null, 2)}
`, "utf8");
    yomiuriCacheDirty = false;
  }
}


function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSpace(value) {
  return String(value || "")
    .normalize("NFKC")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripNameNoise(value) {
  return normalizeSpace(value)
    .replace(/^[0-9０-９]+\s*区/gu, " ")
    .replace(/^比例(?:北海道|東北|北関東|南関東|東京|北陸信越|東海|近畿|中国|四国|九州)ブロック/gu, " ")
    .replace(/^(?:北海道|東北|北関東|南関東|東京|北陸信越|東海|近畿|中国|四国|九州)比例/gu, " ")
    .replace(/^[区比]/gu, " ")
    .replace(/氏|さん|君$/gu, "")
    .replace(/（[^）]*）|\([^)]*\)|【[^】]*】|\[[^\]]*\]/gu, " ")
    .replace(/衆院選|衆議院|開票結果|候補者|プロフィール|読売新聞|オンライン|選挙区|比例|当選|年齢|党派|経歴|学歴|出身地|自民党|公明党|立憲民主党|日本維新の会|国民民主党|参政党|日本共産党/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildNameAliases(value) {
  const raw = stripNameNoise(value);
  if (!raw) return [];

  const aliases = new Set();
  const add = (candidate) => {
    const cleaned = cleanNameLoose(candidate);
    if (!cleaned) return;
    if (!/[一-龯々〆ヶぁ-んァ-ヶヴー]/u.test(cleaned)) return;
    if (cleaned.length < 2 || cleaned.length > 20) return;
    aliases.add(cleaned);
  };

  add(raw);
  add(raw.replace(/[ぁ-んァ-ヶヴー]{2,}/gu, " "));

  for (const token of raw.split(/[\s/｜|・]+/u)) add(token);

  const matches = raw.match(/[一-龯々〆ヶぁ-んァ-ヶヴー]{2,20}/gu) || [];
  for (const token of matches) add(token);

  const kanjiHeavy = [...aliases].filter((item) => /[一-龯々〆ヶ]/u.test(item));
  return kanjiHeavy.length ? [...new Set([...kanjiHeavy, ...aliases])] : [...aliases];
}

function primaryNameAlias(value) {
  const aliases = buildNameAliases(value);
  if (!aliases.length) return "";
  return aliases[0] || "";
}

function cleanName(value) {
  return primaryNameAlias(value) || normalizeSpace(value).replace(/君$/u, "").replace(/\s+/g, "");
}

function decodeText(buffer, contentType = "") {
  const ctype = String(contentType).toLowerCase();
  const candidates = [];
  if (ctype.includes("shift_jis") || ctype.includes("shift-jis") || ctype.includes("sjis")) {
    candidates.push("shift_jis");
  }
  candidates.push("utf-8", "shift_jis", "euc-jp");

  let best = { text: buffer.toString("utf8"), score: -Infinity };
  for (const encoding of [...new Set(candidates)]) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      let score = 0;
      for (const token of ["衆議院", "議員", "プロフィール", "会派", "政治家", "公式"]) {
        if (text.includes(token)) score += 1;
      }
      if (text.includes("����")) score -= 10;
      if (score > best.score) best = { text, score };
    } catch {
      // ignore
    }
  }
  return best.text;
}

async function fetchRaw(url, kind = "html") {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        accept:
          kind === "json"
            ? "application/json,text/plain;q=0.9,*/*;q=0.8"
            : "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache"
      },
      redirect: "follow",
      signal: controller.signal
    });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJson(url) {
  if (jsonCache.has(url)) return jsonCache.get(url);
  const promise = (async () => {
    const res = await fetchRaw(url, "json");
    return await res.json();
  })();
  jsonCache.set(url, promise);
  return await promise;
}

async function fetchPage(url) {
  if (htmlCache.has(url)) return htmlCache.get(url);
  const promise = (async () => {
    const res = await fetchRaw(url, "html");
    const buffer = Buffer.from(await res.arrayBuffer());
    return decodeText(buffer, res.headers.get("content-type") || "");
  })();
  htmlCache.set(url, promise);
  return await promise;
}

function normalizeUrl(url, baseUrl = "") {
  const raw = String(url || "")
    .replace(/&amp;/g, "&")
    .replace(/^['"]+|['"]+$/g, "")
    .replace(/^[\s\u0000-\u001f]+|[\s\u0000-\u001f]+$/g, "");
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return "";
  const sanitized = raw.replace(/[?#].*$/, "");
  const base = String(baseUrl || "").replace(/[?#].*$/, "");
  try {
    const normalized = new URL(sanitized, base).toString();
    return normalized.replace(/([^:])\/{2,}/g, "$1/");
  } catch {
    return "";
  }
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}


function toHalfWidthKana(value) {
  return String(value || "")
    .replace(/[！-～]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/　/g, " ");
}

function cleanNameLoose(value) {
  return toHalfWidthKana(stripNameNoise(value))
    .replace(/[\s　・･・\-－ー―‐]/g, "")
    .replace(/[()（）【】\[\]「」『』]/g, "")
    .trim();
}

function extractLikelyJapaneseName(text) {
  const normalized = stripNameNoise(text).replace(/\s+/g, "");
  if (!normalized) return "";
  const matches = normalized.match(/[一-龯々〆ヶぁ-んァ-ヶヴー]{2,}/g) || [];
  const filtered = matches.filter((item) => !/衆院選|衆議院|開票結果|候補者|プロフィール|読売新聞|オンライン|選挙区|比例|当選|年齢|党派|経歴|学歴|出身地/.test(item));
  filtered.sort((a, b) => b.length - a.length);
  for (const item of filtered) {
    if (/[一-龯々]/.test(item) && item.length >= 2 && item.length <= 12) return item;
  }
  return filtered[0] || "";
}

function addYomiuriCacheEntry(name, entry) {
  const aliases = buildNameAliases(name);
  if (!aliases.length) return;
  const payload = {
    name: normalizeSpace(name),
    aliases,
    imageUrl: normalizeUrl(entry.imageUrl, entry.pageUrl) || entry.imageUrl,
    pageUrl: normalizeUrl(entry.pageUrl) || entry.pageUrl,
    source: entry.source || "yomiuri-winners"
  };

  for (const key of aliases) {
    const current = persistedYomiuriCache.entries[key];
    if (current && current.imageUrl === payload.imageUrl && current.pageUrl === payload.pageUrl) continue;
    persistedYomiuriCache.entries[key] = payload;
    yomiuriCacheDirty = true;
  }
}

function getYomiuriCacheEntry(name) {
  for (const key of buildNameAliases(name)) {
    if (persistedYomiuriCache.entries[key]) return persistedYomiuriCache.entries[key];
  }
  return null;
}

function pickBestSrcFromSet(value) {
  const raw = normalizeSpace(value);
  if (!raw) return "";
  const parts = raw
    .split(",")
    .map((item) => normalizeSpace(item).split(/\s+/)[0])
    .filter(Boolean);
  return parts[parts.length - 1] || parts[0] || "";
}

function extractImageUrlFromElement($, element, pageUrl = "") {
  const el = $(element);
  const candidates = [
    el.attr("src"),
    el.attr("data-src"),
    el.attr("data-original"),
    el.attr("data-lazy-src"),
    el.attr("data-image"),
    el.attr("data-img"),
    el.attr("srcset") ? pickBestSrcFromSet(el.attr("srcset")) : "",
    el.attr("data-srcset") ? pickBestSrcFromSet(el.attr("data-srcset")) : "",
    el.attr("data-lazy-srcset") ? pickBestSrcFromSet(el.attr("data-lazy-srcset")) : ""
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = normalizeUrl(candidate, pageUrl);
    if (normalized) return normalized;
  }
  return "";
}

function equalJapaneseName(a, b) {
  const aa = cleanNameLoose(a);
  const bb = cleanNameLoose(b);
  if (!aa || !bb) return false;
  return aa === bb;
}

function extractYomiuriWinnersPageLinks(html, pageUrl) {
  const $ = load(html);
  const urls = new Set();
  const add = (href) => {
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;
    if (/yomiuri\.co\.jp\/election\/shugiin\/2026winners\d+\/?$/i.test(normalized)) {
      urls.add(normalized);
    }
  };

  $('a[href]').each((_, el) => add($(el).attr('href') || ''));
  $('[data-href], [data-url], [data-link]').each((_, el) => {
    add($(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-link') || '');
  });

  const rawMatches = String(html).match(/https?:\/\/www\.yomiuri\.co\.jp\/election\/shugiin\/2026winners\d+\/?/gi) || [];
  for (const href of rawMatches) add(href);

  const pathMatches = String(html).match(/\/election\/shugiin\/2026winners\d+\/?/gi) || [];
  for (const href of pathMatches) add(href);

  return [...urls];
}

function extractYomiuriCandidateLinks(html, pageUrl) {
  const $ = load(html);
  const urls = new Set();
  const add = (href) => {
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;
    if (/yomiuri\.co\.jp\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?$/i.test(normalized)) {
      urls.add(normalized);
    }
  };

  $('li.result.result__tosen > a[href], li.result > a[href], a[href]').each((_, el) => add($(el).attr('href') || ''));
  $('[data-href], [data-url], [data-link], [data-candidate-url], [onclick]').each((_, el) => {
    add($(el).attr('data-href') || $(el).attr('data-url') || $(el).attr('data-link') || $(el).attr('data-candidate-url') || '');
    const onclick = String($(el).attr('onclick') || '');
    for (const matched of onclick.match(/https?:\/\/www\.yomiuri\.co\.jp\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?/gi) || []) add(matched);
    for (const matched of onclick.match(/\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?/gi) || []) add(matched);
  });

  const rawMatches = String(html).match(/https?:\/\/www\.yomiuri\.co\.jp\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?/gi) || [];
  for (const href of rawMatches) add(href);

  const pathMatches = String(html).match(/\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?/gi) || [];
  for (const href of pathMatches) add(href);

  return [...urls];
}

function extractYomiuriListProfiles(html, pageUrl) {
  const $ = load(html);
  const out = [];
  const seen = new Set();
  const add = (name, imageUrl, sourceUrl, source = 'yomiuri-winners') => {
    const cleanedName = extractLikelyJapaneseName(name);
    const normalizedImage = normalizeUrl(imageUrl, pageUrl);
    const normalizedSource = normalizeUrl(sourceUrl, pageUrl) || pageUrl;
    if (!cleanedName || !normalizedImage || !normalizedSource) return;
    if (/election-shugiin-ogp\.(jpg|png)/i.test(normalizedImage)) return;
    const key = `${cleanNameLoose(cleanedName)}::${normalizedImage}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: cleanedName, imageUrl: normalizedImage, pageUrl: normalizedSource, source });
  };

  $('li.result.result__tosen').each((_, li) => {
    const block = $(li);
    const anchor = block.find('a[href]').first();
    const href = normalizeUrl(anchor.attr('href') || '', pageUrl);
    if (!href || !/yomiuri\.co\.jp\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?$/i.test(href)) return;

    const name = normalizeSpace(block.find('span.candidate-name').first().text() || anchor.text() || '');
    const info = normalizeSpace(block.find('span.candidate-info').first().text() || '');
    const img = block.find('figure.candidate-photo img, img').first();
    const imageUrl = extractImageUrlFromElement($, img, pageUrl);
    if (!name || !imageUrl) return;
    add(`${name} ${info}`, imageUrl, href, 'yomiuri-list-exact');
  });

  if (out.length > 0) return out;

  $('a[href]').each((_, anchor) => {
    const href = normalizeUrl($(anchor).attr('href') || '', pageUrl);
    if (!href || !/yomiuri\.co\.jp\/election\/shugiin\/2026\/[A-Za-z0-9_-]+\/\d+\/?$/i.test(href)) return;
    const card = $(anchor).closest('li.result, li, article, section, div');
    const hasCandidatePhoto = card.find('figure.candidate-photo, [class*="candidate-photo"]').length > 0;
    const hasCandidateName = card.find('span.candidate-name, [class*="candidate-name"]').length > 0;
    if (!hasCandidatePhoto || !hasCandidateName) return;
    const name = normalizeSpace(card.find('span.candidate-name, [class*="candidate-name"]').first().text() || '');
    const imageUrl = extractImageUrlFromElement($, card.find('figure.candidate-photo img, [class*="candidate-photo"] img, img').first(), pageUrl);
    if (!name || !imageUrl) return;
    add(name, imageUrl, href, 'yomiuri-list-generic');
  });

  return out;
}

function extractYomiuriPageName(html, pageUrl = '') {
  const $ = load(html);
  const candidates = [];
  const push = (value) => {
    const name = extractLikelyJapaneseName(value);
    if (name) candidates.push(name);
  };

  const exactRuby = normalizeSpace($('.election-shugiin-profile__name rb').first().text() || '');
  if (exactRuby) push(exactRuby);

  const exactH1 = normalizeSpace($('.election-shugiin-profile__name h1').first().clone().find('rt, rp').remove().end().text() || '');
  if (exactH1) push(exactH1);

  push($('meta[property="og:title"]').attr('content') || '');
  push($('title').text() || '');

  for (const sel of ['h1', 'main h1', 'article h1', '.election-shugiin-profile__name', '.p-electionCandidateHero__name', '.candidateProfile h1', '[class*="Candidate"] h1']) {
    $(sel).each((_, el) => {
      const clone = $(el).clone();
      clone.find('rt, rp').remove();
      push(clone.text() || '');
    });
  }

  const bodyHead = normalizeSpace($('body').text().slice(0, 1200));
  const explicit = bodyHead.match(/([一-龯々]{2,6}\s*[一-龯々]{1,6})氏/u);
  if (explicit) push(explicit[1]);
  push(bodyHead);

  const normalizedUrl = normalizeUrl(pageUrl);
  if (normalizedUrl) push(decodeURIComponentSafe(normalizedUrl));

  return candidates[0] || '';
}

function extractYomiuriProfile(html, pageUrl) {
  const $ = load(html);
  const exactName = normalizeSpace($('.election-shugiin-profile__name rb').first().text() || '') ||
    normalizeSpace($('.election-shugiin-profile__name h1').first().clone().find('rt, rp').remove().end().text() || '');
  const name = extractLikelyJapaneseName(exactName) || extractYomiuriPageName(html, pageUrl);
  if (!name) return null;

  const exactImg = extractImageUrlFromElement($, $('.election-shugiin-profile__photo img, .election-shugiin-profile__photo source, .election-shugiin-profile__photo picture img').first(), pageUrl);
  if (exactImg && !shouldSkipUrl(exactImg)) {
    return { name, imageUrl: exactImg, pageUrl, source: 'yomiuri-profile-exact' };
  }

  const imageCandidates = [];
  const seen = new Set();
  const push2 = (src, weight = 0, alt = '', extra = '') => {
    const url = normalizeUrl(src, pageUrl);
    if (!url || seen.has(url)) return;
    seen.add(url);
    if (/election-shugiin-ogp\.(jpg|png)/i.test(url)) return;
    if (shouldSkipUrl(url)) return;
    let score = weight;
    const hay = `${url} ${alt} ${extra}`;
    if (/candidate|profile|portrait|face|photo|kao|election|senkyo|shugiin/i.test(hay)) score += 4;
    if (/thumb|icon|logo|banner|ogp|adservice|doubleclick/i.test(hay)) score -= 8;
    imageCandidates.push({ url, score });
  };

  const scopedRoots = ['main', 'article', '[role="main"]', '.election-shugiin-profile', '.p-electionCandidateHero', '.candidateProfile', 'body'];
  for (const rootSel of scopedRoots) {
    const root = $(rootSel).first();
    if (!root.length) continue;
    root.find('img, source').each((_, img) => {
      const el = $(img);
      const alt = normalizeSpace(el.attr('alt') || el.attr('title') || '');
      const context = normalizeSpace(el.closest('figure, picture, div, section').text().slice(0, 120));
      push2(el.attr('src') || '', 10, alt, context);
      push2(el.attr('data-src') || '', 10, alt, context);
      push2(el.attr('data-original') || '', 10, alt, context);
      push2(pickBestSrcFromSet(el.attr('srcset') || ''), 9, alt, context);
      push2(pickBestSrcFromSet(el.attr('data-srcset') || ''), 9, alt, context);
      push2(pickBestSrcFromSet(el.attr('data-lazy-srcset') || ''), 9, alt, context);
    });
  }

  $('meta[property="og:image"], meta[name="twitter:image"], link[rel="image_src"]').each((_, el) => {
    push2($(el).attr('content') || $(el).attr('href') || '', 1, 'meta');
  });

  const rawImageMatches = String(html).match(/https?:\/\/www\.yomiuri\.co\.jp\/images\/election\/shugiin\/2026\/[^"'\s<>()]+/gi) || [];
  for (const matched of rawImageMatches) push2(matched, 30, 'raw-html');

  const pathImageMatches = String(html).match(/\/images\/election\/shugiin\/2026\/[^"'\s<>()]+/gi) || [];
  for (const matched of pathImageMatches) push2(matched, 28, 'raw-html-path');

  imageCandidates.sort((a, b) => b.score - a.score);
  const best = imageCandidates[0];
  if (!best) return null;
  return { name, imageUrl: best.url, pageUrl, source: 'yomiuri-profile-fallback' };
}


async function crawlYomiuriCandidatePagesWithBrowser() {
  let puppeteer = null;
  try {
    puppeteer = await import("puppeteer");
  } catch (error) {
    console.log(`yomiuri-browser: unavailable reason=${error?.message || "unknown"}`);
    return { winnerPages: [], candidatePages: [] };
  }

  const OUT_DIR = path.resolve("..", "yomiuri-debug-runtime");
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const uniqueBy = (arr, keyFn) => {
    const seen = new Set();
    const out = [];
    for (const item of arr) {
      const key = keyFn(item);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(item);
    }
    return out;
  };

  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 2200 }
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    );

    const baseUrl = normalizeUrl(YOMIURI_WINNERS_BASE_URLS[0] || "https://www.yomiuri.co.jp/election/shugiin/2026winners001/");
    await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleep(5000);

    await page.evaluate(async () => {
      const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 8; i += 1) {
        window.scrollTo(0, document.body.scrollHeight);
        await wait(500);
      }
      window.scrollTo(0, 0);
    });

    for (const sel of ["button", "[role=button]", "a"]) {
      const handles = await page.$$(sel);
      for (const handle of handles.slice(0, 40)) {
        try {
          const buttonText = ((await page.evaluate((el) => (el.textContent || "").trim(), handle)) || "").replace(/\s+/g, " ");
          if (/同意|承諾|許可|閉じる|OK|了解/i.test(buttonText)) {
            await handle.click({ delay: 20 }).catch(() => {});
            await sleep(500);
          }
        } catch {}
      }
    }
    await sleep(2000);

    const html = await page.content();
    fs.writeFileSync(path.join(OUT_DIR, 'page.html'), html, 'utf8');
    await page.screenshot({ path: path.join(OUT_DIR, 'page.png'), fullPage: true }).catch(() => {});

    const anchors = await page.$$eval('a[href]', (nodes) =>
      nodes.map((a) => ({
        href: a.href,
        text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
        html: a.outerHTML.slice(0, 1000)
      }))
    );

    const normalizedAnchors = uniqueBy(anchors, (a) => `${a.href}__${a.text}`);
    const electionAnchors = normalizedAnchors.filter((a) => /\/election\/shugiin\//.test(a.href));
    const winnerPages = uniqueBy(
      electionAnchors.filter((a) => /\/election\/shugiin\/2026winners\d+\/?$/i.test(a.href)),
      (a) => a.href
    ).map((a) => normalizeUrl(a.href)).filter(Boolean);
    const candidatePages = uniqueBy(
      electionAnchors.filter((a) => /\/election\/shugiin\/2026\/[A-Z0-9]+\/\d+\/?$/i.test(a.href)),
      (a) => a.href
    ).map((a) => normalizeUrl(a.href)).filter(Boolean);

    fs.writeFileSync(path.join(OUT_DIR, 'all-anchors.json'), JSON.stringify(normalizedAnchors, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'election-anchors.json'), JSON.stringify(electionAnchors, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'winner-pages.json'), JSON.stringify(winnerPages, null, 2), 'utf8');
    fs.writeFileSync(path.join(OUT_DIR, 'candidate-pages.json'), JSON.stringify(candidatePages, null, 2), 'utf8');

    console.log(`yomiuri-browser: anchorCount=${normalizedAnchors.length}`);
    console.log(`yomiuri-browser: electionAnchorCount=${electionAnchors.length}`);
    console.log(`yomiuri-browser: winnerPages=${winnerPages.length}`);
    console.log(`yomiuri-browser: candidatePages=${candidatePages.length}`);

    return { winnerPages, candidatePages };
  } catch (error) {
    console.log(`yomiuri-browser: crawl-failed reason=${error?.message || 'unknown'}`);
    return { winnerPages: [], candidatePages: [] };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function fetchYomiuriProfileWithBrowser(pageUrl) {
  let puppeteer = null;
  try {
    puppeteer = await import("puppeteer");
  } catch {
    return null;
  }
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 2200 }
  });
  const sleepMs = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"
    );
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 60000 });
    await sleepMs(3000);
    const profile = await page.evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+/g, " ");
      const m = text.match(/[一-龯々〆ヶ]{1,6}\s*[一-龯々〆ヶ]{1,6}/u);
      const img = document.querySelector('img[src*="/images/election/shugiin/2026/"]');
      const src = img?.getAttribute('src') || '';
      return { name: m ? m[0].replace(/\s+/g, '') : '', src };
    });
    if (!profile?.src) return null;
    return {
      name: cleanName(profile.name || extractYomiuriPageName(pageUrl, pageUrl)),
      imageUrl: normalizeUrl(profile.src, pageUrl),
      pageUrl,
      source: "yomiuri-winners"
    };
  } catch {
    return null;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function ensureYomiuriCacheBuilt() {
  const existingEntries = { ...(persistedYomiuriCache.entries || {}) };
  const existingPages = { ...(persistedYomiuriCache.pages || {}) };
  const existingCount = Object.keys(existingEntries).length;
  if (!YOMIURI_REBUILD_CACHE && persistedYomiuriCache.updatedAt && existingCount >= 430) {
    console.log(`yomiuri-cache: count=${existingCount}`);
    return persistedYomiuriCache;
  }

  const nextEntries = {};
  const nextPages = {};
  const addTempEntry = (name, entry) => {
    const aliases = buildNameAliases(name);
    if (!aliases.length) return;
    const payload = {
      name: normalizeSpace(name),
      aliases,
      imageUrl: normalizeUrl(entry.imageUrl, entry.pageUrl) || entry.imageUrl,
      pageUrl: normalizeUrl(entry.pageUrl) || entry.pageUrl,
      source: entry.source || 'yomiuri-winners'
    };
    for (const key of aliases) nextEntries[key] = payload;
  };

  const winnersQueue = [...new Set(YOMIURI_WINNERS_BASE_URLS.map((url) => normalizeUrl(url)).filter(Boolean))];
  const visitedWinnerPages = new Set();
  const candidatePageUrls = new Set();
  let fetchFailures = 0;

  while (winnersQueue.length > 0) {
    const url = winnersQueue.shift();
    if (!url || visitedWinnerPages.has(url)) continue;
    visitedWinnerPages.add(url);

    try {
      const html = await fetchPage(url);
      nextPages[url] = { fetchedAt: new Date().toISOString(), kind: 'winners' };

      const listProfiles = extractYomiuriListProfiles(html, url);
      for (const profile of listProfiles) {
        addTempEntry(profile.name, profile);
        if (profile.pageUrl) candidatePageUrls.add(profile.pageUrl);
      }
      for (const link of extractYomiuriCandidateLinks(html, url)) candidatePageUrls.add(link);
      console.log(`yomiuri-cache: list-profiles=${listProfiles.length} url=${url}`);
      for (const nextUrl of extractYomiuriWinnersPageLinks(html, url)) {
        if (!visitedWinnerPages.has(nextUrl)) winnersQueue.push(nextUrl);
      }
    } catch (error) {
      fetchFailures += 1;
      if (fetchFailures <= 3) {
        console.log(`yomiuri-cache: fetch-failed url=${url} reason=${error?.message || 'unknown'}`);
      }
    }
  }

  if (YOMIURI_USE_BROWSER && candidatePageUrls.size < 300) {
    const browserCrawl = await crawlYomiuriCandidatePagesWithBrowser();
    for (const url of browserCrawl.winnerPages || []) visitedWinnerPages.add(url);
    for (const url of browserCrawl.candidatePages || []) candidatePageUrls.add(url);
  }

  console.log(`yomiuri-cache: winners-pages=${visitedWinnerPages.size}`);
  console.log(`yomiuri-cache: candidate-pages=${candidatePageUrls.size}`);

  for (const pageUrl of [...candidatePageUrls].sort()) {
    try {
      const html = await fetchPage(pageUrl);
      nextPages[pageUrl] = { fetchedAt: new Date().toISOString(), kind: 'candidate' };
      let profile = extractYomiuriProfile(html, pageUrl);
      if ((!profile?.name || !profile?.imageUrl) && YOMIURI_USE_BROWSER) {
        profile = await fetchYomiuriProfileWithBrowser(pageUrl);
      }
      if (profile?.name && profile?.imageUrl) addTempEntry(profile.name, profile);
    } catch {
      if (YOMIURI_USE_BROWSER) {
        const profile = await fetchYomiuriProfileWithBrowser(pageUrl);
        if (profile?.name && profile?.imageUrl) addTempEntry(profile.name, profile);
      }
    }
  }

  const nextCount = Object.keys(nextEntries).length;
  const shouldKeepExisting = nextCount < 300 && existingCount > nextCount;
  if (shouldKeepExisting) {
    persistedYomiuriCache.entries = existingEntries;
    persistedYomiuriCache.pages = existingPages;
    persistedYomiuriCache.updatedAt = new Date().toISOString();
    yomiuriCacheDirty = true;
    flushPersistentCaches();
    console.log(`yomiuri-cache: fallback-to-existing count=${existingCount} rebuilt=${nextCount}`);
    return persistedYomiuriCache;
  }

  persistedYomiuriCache.entries = nextEntries;
  persistedYomiuriCache.pages = nextPages;
  persistedYomiuriCache.updatedAt = new Date().toISOString();
  yomiuriCacheDirty = true;
  flushPersistentCaches();
  console.log(`yomiuri-cache: count=${Object.keys(persistedYomiuriCache.entries).length}`);
  return persistedYomiuriCache;
}

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function stableHash(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex").slice(0, 10);
}

function isLikelyBadImage(src = "", alt = "") {
  const s = `${src} ${alt}`.toLowerCase();
  return /(logo|icon|banner|spacer|pixel|sprite|button|btn|share|thumbnail-default|default-user|placeholder|noimage|no-image|ogp-default|header|footer|youtube|facebook|x\.com|twitter|instagram|line|amazons3.*logo|favicon|thumb|group|集合|街頭|演説|speech|rally|building|議事堂|parliament|kensei|assembly)/i.test(
    s
  );
}

function scoreImageCandidate(src, alt = "", name = "", pageUrl = "", sourceHint = "") {
  const s = String(src || "");
  const a = normalizeSpace(alt);
  if (!/^https?:\/\//i.test(s)) return -100;
  if (isLikelyBadImage(s, a)) return -60;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(s) && !/Special:FilePath/i.test(s)) return -15;

  let score = 0;
  const decodedUrl = decodeURIComponentSafe(s);
  const hay = `${decodedUrl} ${a}`.replace(/[\s\-_]/g, "");
  const plainName = cleanName(name);

  if (/upload\.wikimedia|commons\.wikimedia/i.test(s)) score += 10;
  if (/portrait|profile|face|kao|photo|member|giin|politician|headshot/i.test(s)) score += 4;
  if (/member|profile|giin|politician|representative/i.test(pageUrl)) score += 2;
  if (/meta/.test(sourceHint)) score += 1;
  if (/figure/.test(sourceHint)) score += 1;
  if (/official|manual/.test(sourceHint)) score += 2;
  if (plainName && hay.includes(plainName)) score += 6;
  if (plainName && /[ァ-ヶ一-龯々]/u.test(plainName)) {
    const family = plainName.slice(0, Math.max(1, Math.floor(plainName.length / 2)));
    if (family && hay.includes(family)) score += 2;
  }
  if (/\b(400|500|600|700|800|900|1000)\b/.test(s)) score += 1;
  if (/speaker|speech|meeting|街頭|街宣|演説|youtube|サムネ|集合|group/i.test(a)) score -= 8;
  if (/poster|flyer|bill|leaflet|senkyo|選挙|policy|manifesto/i.test(s)) score -= 3;
  if (/building|議事堂|parliament/i.test(s)) score -= 8;
  if (/go2senkyo|smartvote|senkyo\.janjan/i.test(s)) score += 3;
  if (/jimin\.jp|cdp-japan\.jp|o-ishin\.jp|komei\.or\.jp|new-kokumin\.jp|jcp\.or\.jp|reiwa-shinsengumi\.com|sanseito\.jp/i.test(s)) score += 4;
  return score;
}

function looksPoliticianPage(text, name) {
  const s = normalizeSpace(text);
  let score = 0;
  if (name && s.includes(name)) score += 4;
  for (const token of ["衆議院", "議員", "プロフィール", "会派", "公式サイト", "自由民主党", "立憲民主党", "公明党", "維新", "国民民主党", "参政党", "開票結果", "当選者", "読売新聞"] ) {
    if (s.includes(token)) score += 1;
  }
  return score >= 4;
}

function extractSearchTargetsFromDuckDuckGo(html, allowedDomains = []) {
  const $ = load(html);
  const out = [];
  const seen = new Set();
  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href.includes("uddg=")) return;
    const m = href.match(/[?&]uddg=([^&]+)/);
    const target = m ? decodeURIComponentSafe(m[1]) : "";
    if (!/^https?:\/\//i.test(target)) return;
    const host = hostnameOf(target);
    if (allowedDomains.length && !allowedDomains.some((d) => host === d || host.endsWith(`.${d}`))) return;
    if (seen.has(target)) return;
    seen.add(target);
    out.push(target);
  });
  return out;
}

function extractSearchTargetsFromDuckDuckGoLite(html, allowedDomains = []) {
  const $ = load(html);
  const out = [];
  const seen = new Set();
  $("a[href]").each((_, a) => {
    const href = normalizeSpace($(a).attr("href") || "");
    if (!/^https?:\/\//i.test(href)) return;
    const host = hostnameOf(href);
    if (/duckduckgo\.com/.test(host)) return;
    if (allowedDomains.length && !allowedDomains.some((d) => host === d || host.endsWith(`.${d}`))) return;
    if (seen.has(href)) return;
    seen.add(href);
    out.push(href);
  });
  return out;
}

function extractSearchTargetsFromBing(html, allowedDomains = []) {
  const $ = load(html);
  const out = [];
  const seen = new Set();
  $("a[href]").each((_, a) => {
    const href = normalizeSpace($(a).attr("href") || "");
    if (!/^https?:\/\//i.test(href)) return;
    if (/(\/images\/|bing\.com\/ck\/a\?|microsoft|go\.microsoft)/i.test(href)) return;
    const host = hostnameOf(href);
    if (allowedDomains.length && !allowedDomains.some((d) => host === d || host.endsWith(`.${d}`))) return;
    if (seen.has(href)) return;
    seen.add(href);
    out.push(href);
  });
  return out;
}


function mapSourceLabelToHistoryKey(sourceLabel = "") {
  if (/manual/.test(sourceLabel)) return "official";
  if (/official/.test(sourceLabel)) return "official";
  if (/yomiuri/.test(sourceLabel)) return "yomiuri";
  if (/wikipedia/.test(sourceLabel)) return "wikipedia";
  if (/wikidata|wikimedia|commons/.test(sourceLabel)) return "wikimedia";
  if (/party/.test(sourceLabel)) return "party";
  if (/trusted-fallback/.test(sourceLabel)) return "news";
  if (/web-fallback/.test(sourceLabel)) return "web";
  return sourceLabel || "web";
}

async function searchTargets(query, allowedDomains = []) {
  const cacheKey = JSON.stringify({ query, allowedDomains });
  if (searchCache.has(cacheKey)) return searchCache.get(cacheKey);

  const promise = (async () => {
    const results = [];
    const seen = new Set();

    const pushAll = (items) => {
      for (const target of items) {
        if (seen.has(target) || shouldSkipUrl(target)) continue;
        seen.add(target);
        results.push(target);
        if (results.length >= SEARCH_RESULT_LIMIT) break;
      }
    };

    try {
      const html = await fetchPage(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
      pushAll(extractSearchTargetsFromDuckDuckGo(html, allowedDomains));
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    } catch {}

    try {
      const html = await fetchPage(`https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`);
      pushAll(extractSearchTargetsFromDuckDuckGoLite(html, allowedDomains));
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    } catch {}

    try {
      const html = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
      pushAll(extractSearchTargetsFromBing(html, allowedDomains));
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    } catch {}

    try {
      const html = await fetchPage(`https://search.yahoo.co.jp/search?p=${encodeURIComponent(query)}`);
      pushAll(extractSearchTargetsFromBing(html, allowedDomains));
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    } catch {}

    return results;
  })();

  searchCache.set(cacheKey, promise);
  return await promise;
}

function collectImageCandidatesFromPage(html, pageUrl, name, pageWeight = 0) {
  const $ = load(html);
  const candidates = [];
  const seen = new Set();

  const pushCandidate = (src, alt = "", sourceHint = "page") => {
    const url = normalizeUrl(src, pageUrl);
    if (!url) return;
    if (shouldSkipUrl(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    const score = scoreImageCandidate(url, alt, name, pageUrl, sourceHint) + pageWeight;
    if (score <= 0) return;
    candidates.push({ url, alt, score, sourceHint });
  };

  for (const sel of [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]'
  ]) {
    $(sel).each((_, el) => pushCandidate($(el).attr("content") || "", "", "meta"));
  }

  $("img[src], img[data-src], img[data-lazy-src]").each((_, img) => {
    const el = $(img);
    const alt = normalizeSpace(el.attr("alt") || el.attr("title") || "");
    const parentText = normalizeSpace(el.parent().text() || "").slice(0, 120);
    const className = normalizeSpace(el.attr("class") || "");
    const sourceHint = `${className} ${parentText}`;
    pushCandidate(el.attr("src") || "", alt, sourceHint);
    pushCandidate(el.attr("data-src") || "", alt, sourceHint);
    pushCandidate(el.attr("data-lazy-src") || "", alt, sourceHint);
    pushCandidate(el.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0] || "", alt, sourceHint);
  });

  $("figure img, .profile img, .member img, .politician img").each((_, img) => {
    const el = $(img);
    const alt = normalizeSpace(el.attr("alt") || el.attr("title") || "");
    pushCandidate(el.attr("src") || "", alt, "figure profile");
  });

  const nameNoSpace = cleanName(name);
  for (const item of candidates) {
    const hay = `${item.url} ${item.alt}`.replace(/[\s\-_]/g, "");
    if (hay.includes(nameNoSpace)) item.score += 3;
    if (item.sourceHint === "meta") item.score += 1;
    if (/(member|profile|politician|giin)/i.test(pageUrl)) item.score += 1;
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

async function resolveImageFromProfilePage(profileUrl, name, sourceLabel = "official", pageWeight = 0) {
  if (!profileUrl || shouldSkipUrl(profileUrl)) return null;
  const historyKey = mapSourceLabelToHistoryKey(sourceLabel);
  if (shouldSkipSource(name, historyKey)) return null;
  const cacheKey = `${sourceLabel}:${profileUrl}:${cleanName(name)}`;
  if (profilePageCache.has(cacheKey)) return profilePageCache.get(cacheKey);

  const promise = (async () => {
    try {
      const html = await fetchPage(profileUrl);
      if (!looksPoliticianPage(html, name)) {
        setSourceState(name, historyKey, "not_found");
        markUrlState(profileUrl, "not_found", "not-politician-page");
        return null;
      }
      const candidates = collectImageCandidatesFromPage(html, profileUrl, name, pageWeight);
      const best = candidates[0];
      if (!best) {
        setSourceState(name, historyKey, "not_found");
        markUrlState(profileUrl, "not_found", "no-image-candidate");
        return null;
      }
      setSourceState(name, historyKey, "success");
      return {
        url: best.url,
        source: sourceLabel,
        sourceUrl: profileUrl
      };
    } catch {
      setSourceState(name, historyKey, "not_found");
      markUrlState(profileUrl, "not_found", "fetch-failed");
      return null;
    }
  })();

  profilePageCache.set(cacheKey, promise);
  return await promise;
}

async function searchWikipediaImage(name) {
  if (shouldSkipSource(name, "wikipedia")) return null;
  const titleCandidates = [name, `${name} (政治家)`, `${name}_(政治家)`];
  for (const rawTitle of titleCandidates) {
    const wikiTitle = rawTitle.replace(/ /g, "_");
    try {
      const summary = await fetchJson(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
      const img = summary?.originalimage?.source || summary?.thumbnail?.source || "";
      if (img && /^https?:\/\//.test(img)) {
        setSourceState(name, "wikipedia", "success");
        return {
          url: img,
          source: "wikipedia",
          sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`
        };
      }
    } catch {
      // continue
    }
  }

  const searchQueries = [`intitle:${name} 政治家`, `"${name}" 衆議院議員`, `"${name}" 政治家`];
  for (const q of searchQueries) {
    try {
      const search = await fetchJson(
        `https://ja.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&utf8=1&format=json&origin=*`
      );
      const candidates = search?.query?.search || [];
      const hit = candidates.find((item) => {
        const title = normalizeSpace(String(item?.title || ""));
        return title === name || title === `${name} (政治家)`;
      });
      if (!hit) continue;
      const title = String(hit.title).replace(/ /g, "_");
      const page = await fetchJson(
        `https://ja.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|thumbnail&pithumbsize=800&titles=${encodeURIComponent(title)}&format=json&origin=*`
      );
      const pages = page?.query?.pages || {};
      const first = Object.values(pages)[0];
      const img = first?.original?.source || first?.thumbnail?.source || "";
      if (img) {
        setSourceState(name, "wikipedia", "success");
        return {
          url: img,
          source: "wikipedia",
          sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`
        };
      }
    } catch {
      // continue
    }
  }

  setSourceState(name, "wikipedia", "not_found");
  return null;
}

function isLikelyWikidataPersonCandidate(candidate = {}, name = "") {
  const label = normalizeSpace(candidate?.label || candidate?.display?.label?.value || "");
  const desc = normalizeSpace(candidate?.description || candidate?.display?.description?.value || "");
  const cleaned = cleanName(name);
  const cleanedLabel = cleanName(label);
  if (cleaned && cleanedLabel && cleaned === cleanedLabel) return true;
  if (cleaned && cleanedLabel.includes(cleaned)) return true;
  return /(日本|衆議院|議員|政治家|politician)/i.test(desc);
}

async function searchWikidataCommonsImage(name) {
  if (shouldSkipSource(name, "wikimedia")) return null;
  const queries = [`${name} 政治家`, `${name} 衆議院議員`, name];
  for (const query of queries) {
    try {
      const search = await fetchJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&limit=8&format=json&origin=*`
      );
      const candidates = Array.isArray(search?.search) ? search.search : [];
      for (const candidate of candidates) {
        if (!isLikelyWikidataPersonCandidate(candidate, name)) continue;
        const id = candidate?.id;
        if (!id) continue;
        const entityRes = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(String(id))}.json`);
        const entity = entityRes?.entities?.[id];
        const fileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (!fileName) continue;
        const commonsFile = String(fileName).replace(/ /g, "_");
        setSourceState(name, "wikimedia", "success");
        return {
          url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commonsFile)}`,
          source: "wikidata-commons",
          sourceUrl: `https://www.wikidata.org/wiki/${encodeURIComponent(String(id))}`
        };
      }
    } catch {
      // continue
    }
  }
  setSourceState(name, "wikimedia", "not_found");
  return null;
}

function yomiuriSourcePagesFor(member) {
  const party = String(member.party || member.role || "");
  const urls = new Set(YOMIURI_WINNERS_BASE_URLS);
  for (const hint of YOMIURI_HINTS) {
    if (hint.match.test(party)) {
      for (const url of hint.urls) urls.add(url);
    }
  }
  return [...urls];
}

async function searchFromYomiuriWinners(member) {
  const name = member.name;
  if (shouldSkipSource(name, "yomiuri")) return null;

  await ensureYomiuriCacheBuilt();
  const cached = getYomiuriCacheEntry(name);
  if (cached?.imageUrl) {
    setSourceState(name, "yomiuri", "success");
    return { url: cached.imageUrl, source: "yomiuri-winners", sourceUrl: cached.pageUrl || cached.imageUrl };
  }

  const memberAliases = new Set([
    ...buildNameAliases(member.name),
    ...buildNameAliases(String(member.kana || ''))
  ]);
  if (memberAliases.size) {
    for (const entry of Object.values(persistedYomiuriCache.entries || {})) {
      const pageAliases = new Set([
        ...buildNameAliases(entry?.name || ''),
        ...buildNameAliases(`${entry?.name || ''} ${entry?.pageUrl || ''}`)
      ]);
      for (const alias of memberAliases) {
        if (pageAliases.has(alias) && entry?.imageUrl) {
          setSourceState(name, "yomiuri", "success");
          return { url: entry.imageUrl, source: "yomiuri-winners", sourceUrl: entry.pageUrl || entry.imageUrl };
        }
      }
    }
  }

  setSourceState(name, "yomiuri", "not_found");
  return null;
}

function partyHintsFor(member) {
  const party = String(member.party || member.role || "");
  return PARTY_HINTS.filter((item) => item.match.test(party));
}

async function searchFromPartyHints(member) {
  const name = member.name;
  if (shouldSkipSource(name, "party")) return null;
  for (const hint of partyHintsFor(member)) {
    for (const query of hint.queries(name)) {
      const targets = await searchTargets(query, hint.domains);
      for (const target of targets) {
        const found = await resolveImageFromProfilePage(target, name, "party-site", 5);
        if (found) return found;
        await sleep(WAIT_MS);
      }
    }
  }
  setSourceState(name, "party", "not_found");
  return null;
}

async function searchFromGeneralWeb(member) {
  const name = member.name;
  if (shouldSkipSource(name, "web")) return null;
  const queries = GENERAL_QUERY_VARIANTS(name);
  for (const query of queries) {
    const targets = await searchTargets(query);
    for (const target of targets) {
      const host = hostnameOf(target);
      if (/youtube\.com|youtu\.be|facebook\.com|x\.com|twitter\.com|instagram\.com/.test(host)) continue;
      const found = await resolveImageFromProfilePage(target, name, "web-fallback", 0);
      if (found) return found;
      await sleep(WAIT_MS);
    }
  }
  setSourceState(name, "web", "not_found");
  return null;
}

async function searchFromTrustedFallbacks(member) {
  const name = member.name;
  if (shouldSkipSource(name, "news")) return null;
  const queries = [
    `site:go2senkyo.com ${name}`,
    `site:smartvote.jp ${name}`,
    `site:senkyo.janjan.jp ${name}`,
    `${name} go2senkyo`,
    `${name} smartvote`
  ];
  for (const query of queries) {
    const targets = await searchTargets(query, TRUSTED_FALLBACK_DOMAINS);
    for (const target of targets) {
      const found = await resolveImageFromProfilePage(target, name, "trusted-fallback", 2);
      if (found) return found;
      await sleep(WAIT_MS);
    }
  }
  setSourceState(name, "news", "not_found");
  return null;
}

function readManualSourceEntry(member) {
  return MANUAL_SOURCE_PAGES[cleanName(member.name)] || MANUAL_SOURCE_PAGES[member.name] || null;
}

async function resolveImageFromManualSourcePages(member) {
  if (shouldSkipSource(member.name, "official")) return null;
  const entry = readManualSourceEntry(member);
  if (!entry) {
    setSourceState(member.name, "official", "not_found");
    return null;
  }

  const directImageUrl = normalizeUrl(entry.directImageUrl || entry.imageUrl || "");
  if (directImageUrl) {
    setSourceState(member.name, "official", "success");
    return {
      url: directImageUrl,
      source: "manual-direct-image",
      sourceUrl: normalizeUrl(entry.directSourceUrl || entry.sourceUrl || entry.candidatePageUrls?.[0] || "") || directImageUrl
    };
  }

  const candidates = Array.isArray(entry.candidatePageUrls) ? entry.candidatePageUrls : [];
  for (const pageUrl of candidates) {
    const found = await resolveImageFromProfilePage(pageUrl, member.name, "manual-source-page", 8);
    if (found) return found;
    await sleep(WAIT_MS);
  }
  setSourceState(member.name, "official", "not_found");
  return null;
}

function shouldMaskBottom(found = {}, member = {}) {
  if (!ENABLE_TEXT_MASK) return false;
  const joined = [found?.source || "", found?.url || "", found?.sourceUrl || "", member?.party || "", member?.role || ""].join(" ").toLowerCase();
  return /(party-site|trusted-fallback|web-fallback|manual-direct-image|go2senkyo|smartvote|senkyo\.janjan|jimin\.jp|cdp-japan\.jp|o-ishin\.jp|komei\.or\.jp|new-kokumin\.jp|jcp\.or\.jp|reiwa-shinsengumi\.com|sanseito\.jp|sdp\.or\.jp|hoshuto\.jp|選挙|ポスター|公認|manifesto|policy)/i.test(joined);
}

function sameNormalizedUrl(a = "", b = "") {
  const na = normalizeUrl(a);
  const nb = normalizeUrl(b);
  return Boolean(na) && Boolean(nb) && na === nb;
}

function shouldAcceptFound(member = {}, found = {}) {
  if (!found?.url) return false;
  if (EFFECTIVE_TARGET_MODE !== "fix") return true;
  const currentImage = String(member?.image || "").trim();
  if (!currentImage) return true;
  if (sameNormalizedUrl(found.url, currentImage)) return false;
  return true;
}

function markResolved(member, found) {
  member.image = found.url;
  member.imageSource = found.source;
  member.imageSourceUrl = found.sourceUrl;
  member.aiGuess = ![
    "wikipedia",
    "wikidata-commons",
    "official-profile",
    "official-manual",
    "party-site",
    "trusted-fallback",
    "manual-source-page",
    "manual-direct-image",
    "yomiuri-winners"
  ].includes(found.source);
  member.sourceType = member.aiGuess ? "estimated" : "verified";
  member.imageMaskBottom = shouldMaskBottom(found, member);
  member.imageMaskMode = member.imageMaskBottom ? "pixelate-bottom" : "none";
}

async function tryResolver(member, resolver) {
  const found = await resolver();
  if (!found?.url) return null;
  if (!shouldAcceptFound(member, found)) return null;
  return found;
}

async function resolveImage(member) {
  const name = cleanName(member.name);

  if (MANUAL_BAD_IMAGE_REMOVALS.has(name) && !YOMIURI_ONLY) return null;
  if (MANUAL_OVERRIDES[name] && !YOMIURI_ONLY) return MANUAL_OVERRIDES[name];

  const profileUrl = String(member.profileUrl || "").trim();
  const resolverSteps = YOMIURI_ONLY
    ? [
        () => searchFromYomiuriWinners(member),
        () => resolveImageFromManualSourcePages(member)
      ]
    : EFFECTIVE_TARGET_MODE === "fix"
      ? [
          () => searchFromYomiuriWinners(member),
          () => resolveImageFromManualSourcePages(member),
          () => (profileUrl ? resolveImageFromProfilePage(profileUrl, member.name, "official-profile", 10) : null),
          () => searchFromPartyHints(member),
          () => searchFromTrustedFallbacks(member),
          () => searchWikipediaImage(member.name),
          () => searchWikidataCommonsImage(member.name),
          () => (!SKIP_AI_GUESS ? searchFromGeneralWeb(member) : null)
        ]
      : [
          () => searchFromYomiuriWinners(member),
          () => resolveImageFromManualSourcePages(member),
          () => (profileUrl ? resolveImageFromProfilePage(profileUrl, member.name, "official-profile", 10) : null),
          () => searchWikipediaImage(member.name),
          () => searchWikidataCommonsImage(member.name),
          () => searchFromPartyHints(member),
          () => searchFromTrustedFallbacks(member),
          () => (!SKIP_AI_GUESS ? searchFromGeneralWeb(member) : null)
        ];

  for (let i = 0; i < resolverSteps.length; i += 1) {
    const found = await tryResolver(member, resolverSteps[i]);
    if (found) return found;
    if (i + 1 < resolverSteps.length) {
      await sleep(WAIT_MS);
    }
  }

  return null;
}

async function mapWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let index = 0;

  async function runOne() {
    while (true) {
      const current = index;
      index += 1;
      if (current >= items.length) return;
      results[current] = await worker(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => runOne()));
  return results;
}


function normalizeTargetMode(value) {
  const mode = String(value || "missing").trim().toLowerCase();
  if (["all", "review", "fix", "missing"].includes(mode)) return mode;
  return "missing";
}

const EFFECTIVE_TARGET_MODE = normalizeTargetMode(TARGET_MODE);

function buildFixTargetNameSet() {
  const set = new Set();
  for (const item of Array.isArray(FIX_TARGETS) ? FIX_TARGETS : []) {
    const name = cleanName(item?.name || "");
    if (name) set.add(name);
  }
  return set;
}

const FIX_TARGET_NAME_SET = buildFixTargetNameSet();

const SEARCH_SOURCE_ORDER = ["yomiuri", "official", "party", "wikipedia", "wikimedia", "news", "web"];

function hasRemainingSources(name) {
  return SEARCH_SOURCE_ORDER.some((sourceKey) => getSourceState(name, sourceKey) !== "not_found");
}


function isFixTarget(member) {
  return FIX_TARGET_NAME_SET.has(cleanName(member?.name || ""));
}

function shouldProcessMember(member) {
  const hasImage = Boolean(normalizeSpace(member.image));
  const aiGuess = Boolean(member.aiGuess);

  if (YOMIURI_ONLY && YOMIURI_REPLACE_EXISTING) return true;
  if (EFFECTIVE_TARGET_MODE === "all") return true;
  if (EFFECTIVE_TARGET_MODE === "review") return hasImage && aiGuess;
  if (EFFECTIVE_TARGET_MODE === "fix") return isFixTarget(member);
  return !hasImage && hasRemainingSources(member.name);
}

function buildWorkQueue(members) {
  const queue = members
    .map((member, index) => ({ member, index }))
    .filter(({ member }) => shouldProcessMember(member));

  return queue.slice(0, BATCH_LIMIT);
}

async function main() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const members = JSON.parse(raw);
  if (YOMIURI_ONLY) {
    await ensureYomiuriCacheBuilt();
  }
  const queue = buildWorkQueue(members);

  let filled = 0;
  let stillMissing = 0;
  let skipped = members.length - queue.length;

  console.log(
    `auto-image-fetch:v6 mode=${EFFECTIVE_TARGET_MODE} total=${members.length} candidates=${members.filter((member) => shouldProcessMember(member)).length} batch=${queue.length} batchLimit=${BATCH_LIMIT} concurrency=${CONCURRENCY}`
  );

  if (!queue.length) {
    console.log(`auto-image-fetch:v6 nothing-to-process mode=${EFFECTIVE_TARGET_MODE}`);
    return;
  }

  await mapWithConcurrency(
    queue,
    async ({ member, index }, queueIndex) => {
      const found = await resolveImage(member);
      if (found?.url) {
        markResolved(member, found);
        filled += 1;
        console.log(`filled: ${member.name} -> ${found.source}`);
      } else {
        stillMissing += 1;
        console.log(`missing: ${member.name}`);
      }

      if ((queueIndex + 1) % 5 === 0 || queueIndex + 1 === queue.length) {
        flushPersistentCaches();
        console.log(
          `progress: ${queueIndex + 1}/${queue.length} lastGlobalIndex=${index + 1}/${members.length} filled=${filled} missing=${stillMissing}`
        );
      }
      await sleep(WAIT_MS);
    },
    CONCURRENCY
  );

  fs.writeFileSync(dataPath, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`auto-image-fetch:v6 complete mode=${EFFECTIVE_TARGET_MODE} skipped=${skipped} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
