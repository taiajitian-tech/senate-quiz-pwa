import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const dataPath = path.resolve("public/data/representatives.json");
const TIMEOUT_MS = Number(process.env.REP_IMAGE_TIMEOUT_MS || 12000);
const WAIT_MS = Number(process.env.REP_IMAGE_WAIT_MS || 100);
const CONCURRENCY = Math.max(1, Number(process.env.REP_IMAGE_CONCURRENCY || 8));
const SEARCH_RESULT_LIMIT = Math.max(3, Number(process.env.REP_IMAGE_SEARCH_LIMIT || 8));

const MANUAL_SOURCE_PAGES_PATH = path.resolve("scripts/representativeImageSourcePages.json");
const MANUAL_SOURCE_PAGES = fs.existsSync(MANUAL_SOURCE_PAGES_PATH)
  ? JSON.parse(fs.readFileSync(MANUAL_SOURCE_PAGES_PATH, "utf8"))
  : {};

const MANUAL_BAD_IMAGE_REMOVALS = new Set(["安藤たかお"]);
const MANUAL_OVERRIDES = {
  浅田眞澄美: {
    url: "http://asada-masumi.com/wordpress/wp-content/uploads/2011/07/sotsu2.jpg",
    source: "official-manual",
    sourceUrl: "https://asada-masumi.com/about-us/"
  }
};

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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSpace(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/\u3000/g, " ").replace(/\s+/g, " ").trim();
}

function cleanName(value) {
  return normalizeSpace(value).replace(/君$/u, "").replace(/\s+/g, "");
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
  const res = await fetchRaw(url, "json");
  return await res.json();
}

async function fetchPage(url) {
  const res = await fetchRaw(url, "html");
  const buffer = Buffer.from(await res.arrayBuffer());
  return decodeText(buffer, res.headers.get("content-type") || "");
}

function normalizeUrl(url, baseUrl = "") {
  const raw = String(url || "").trim();
  if (!raw || /^data:/i.test(raw)) return "";
  try {
    return new URL(raw, baseUrl).toString();
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

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function isLikelyBadImage(src = "", alt = "") {
  const s = `${src} ${alt}`.toLowerCase();
  return /(logo|icon|banner|spacer|pixel|sprite|button|btn|share|thumbnail-default|default-user|placeholder|noimage|no-image|ogp-default|header|footer|youtube|facebook|x\.com|twitter|instagram|line|amazons3.*logo|favicon|poster|flyer|bill|manifesto|policy|leaflet|thumb)/i.test(
    s
  );
}

function scoreImageCandidate(src, alt = "", name = "", pageUrl = "") {
  const s = String(src || "");
  const a = normalizeSpace(alt);
  if (!/^https?:\/\//i.test(s)) return -100;
  if (isLikelyBadImage(s, a)) return -50;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(s)) return -10;

  let score = 0;
  if (/upload\.wikimedia|commons\.wikimedia/i.test(s)) score += 8;
  if (/portrait|profile|face|kao|photo|member|giin|politician|headshot/i.test(s)) score += 4;
  if (/member|profile|giin|politician|representative/i.test(pageUrl)) score += 2;
  if (name) {
    const plainName = cleanName(name);
    const hay = `${decodeURIComponentSafe(s)} ${a}`.replace(/[\s\-_]/g, "");
    if (hay.includes(plainName)) score += 6;
  }
  if (/\b(400|500|600|700|800|900|1000)\b/.test(s)) score += 1;
  if (/speaker|speech|meeting|街頭|街宣|演説|youtube|サムネ/i.test(a)) score -= 6;
  if (/poster|flyer|bill|leaflet|senkyo|選挙|policy|manifesto/i.test(s)) score -= 6;
  return score;
}

function looksPoliticianPage(text, name) {
  const s = normalizeSpace(text);
  let score = 0;
  if (name && s.includes(name)) score += 4;
  for (const token of ["衆議院", "議員", "プロフィール", "会派", "公式サイト", "自由民主党", "立憲民主党", "公明党", "維新", "国民民主党", "参政党"]) {
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

async function searchTargets(query, allowedDomains = []) {
  const results = [];
  const seen = new Set();

  try {
    const html = await fetchPage(`https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`);
    for (const target of extractSearchTargetsFromDuckDuckGo(html, allowedDomains)) {
      if (seen.has(target)) continue;
      seen.add(target);
      results.push(target);
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    }
  } catch {
    // ignore
  }

  try {
    const html = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
    for (const target of extractSearchTargetsFromBing(html, allowedDomains)) {
      if (seen.has(target)) continue;
      seen.add(target);
      results.push(target);
      if (results.length >= SEARCH_RESULT_LIMIT) return results;
    }
  } catch {
    // ignore
  }

  return results;
}

function collectImageCandidatesFromPage(html, pageUrl, name) {
  const $ = load(html);
  const candidates = [];

  const pushCandidate = (src, alt = "", sourceHint = "page") => {
    const url = normalizeUrl(src, pageUrl);
    if (!url) return;
    const score = scoreImageCandidate(url, alt, name, pageUrl);
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

  $("img[src]").each((_, img) => {
    const el = $(img);
    const alt = normalizeSpace(el.attr("alt") || el.attr("title") || "");
    pushCandidate(el.attr("src") || "", alt, "img");
    pushCandidate(el.attr("data-src") || "", alt, "img");
    pushCandidate(el.attr("data-lazy-src") || "", alt, "img");
    pushCandidate(el.attr("srcset")?.split(",")[0]?.trim().split(/\s+/)[0] || "", alt, "img");
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

async function resolveImageFromProfilePage(profileUrl, name, sourceLabel = "official") {
  if (!profileUrl) return null;
  try {
    const html = await fetchPage(profileUrl);
    if (!looksPoliticianPage(html, name)) return null;
    const candidates = collectImageCandidatesFromPage(html, profileUrl, name);
    const best = candidates[0];
    if (!best) return null;
    return {
      url: best.url,
      source: sourceLabel,
      sourceUrl: profileUrl
    };
  } catch {
    return null;
  }
}

async function searchWikipediaImage(name) {
  const titleCandidates = [name, `${name} (政治家)`, `${name}_(政治家)`];
  for (const rawTitle of titleCandidates) {
    const wikiTitle = rawTitle.replace(/ /g, "_");
    try {
      const summary = await fetchJson(`https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(wikiTitle)}`);
      const img = summary?.originalimage?.source || summary?.thumbnail?.source || "";
      if (img && /^https?:\/\//.test(img)) {
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

  return null;
}

async function searchWikidataCommonsImage(name) {
  const queries = [`${name} 政治家`, `${name} 衆議院議員`, name];
  for (const query of queries) {
    try {
      const search = await fetchJson(
        `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(query)}&language=ja&limit=5&format=json&origin=*`
      );
      const candidates = Array.isArray(search?.search) ? search.search : [];
      for (const candidate of candidates) {
        const id = candidate?.id;
        if (!id) continue;
        const entityRes = await fetchJson(`https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(String(id))}.json`);
        const entity = entityRes?.entities?.[id];
        const fileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (!fileName) continue;
        const commonsFile = String(fileName).replace(/ /g, "_");
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
  return null;
}

function partyHintsFor(member) {
  const party = String(member.party || member.role || "");
  return PARTY_HINTS.filter((item) => item.match.test(party));
}

async function searchFromPartyHints(member) {
  const name = member.name;
  for (const hint of partyHintsFor(member)) {
    for (const query of hint.queries(name)) {
      const targets = await searchTargets(query, hint.domains);
      for (const target of targets) {
        const found = await resolveImageFromProfilePage(target, name, "party-site");
        if (found) return found;
        await sleep(WAIT_MS);
      }
    }
  }
  return null;
}

async function searchFromGeneralWeb(member) {
  const name = member.name;
  const queries = [
    `${name} 衆議院議員 公式 プロフィール`,
    `${name} 衆議院 議員 プロフィール`,
    `${name} 政治家 公式`
  ];
  for (const query of queries) {
    const targets = await searchTargets(query);
    for (const target of targets) {
      const host = hostnameOf(target);
      if (/wikipedia\.org|wikimedia\.org|youtube\.com|youtu\.be|facebook\.com|x\.com|twitter\.com|instagram\.com/.test(host)) {
        continue;
      }
      const found = await resolveImageFromProfilePage(target, name, "web-fallback");
      if (found) return found;
      await sleep(WAIT_MS);
    }
  }
  return null;
}

async function resolveImageFromManualSourcePages(member) {
  const entry = MANUAL_SOURCE_PAGES[cleanName(member.name)] || MANUAL_SOURCE_PAGES[member.name];
  if (!entry) return null;
  const candidates = Array.isArray(entry.candidatePageUrls) ? entry.candidatePageUrls : [];
  for (const pageUrl of candidates) {
    const found = await resolveImageFromProfilePage(pageUrl, member.name, "manual-source-page");
    if (found) return found;
    await sleep(WAIT_MS);
  }
  return null;
}

async function resolveImage(member) {
  const name = cleanName(member.name);

  if (MANUAL_BAD_IMAGE_REMOVALS.has(name)) {
    return null;
  }

  if (MANUAL_OVERRIDES[name]) {
    return MANUAL_OVERRIDES[name];
  }

  const manualSource = await resolveImageFromManualSourcePages(member);
  if (manualSource) return manualSource;
  await sleep(WAIT_MS);

  const profileUrl = String(member.profileUrl || "").trim();
  if (profileUrl) {
    const direct = await resolveImageFromProfilePage(profileUrl, member.name, "official-profile");
    if (direct) return direct;
    await sleep(WAIT_MS);
  }

  const partySite = await searchFromPartyHints(member);
  if (partySite) return partySite;
  await sleep(WAIT_MS);

  const wikipedia = await searchWikipediaImage(member.name);
  if (wikipedia) return wikipedia;
  await sleep(WAIT_MS);

  const commons = await searchWikidataCommonsImage(member.name);
  if (commons) return commons;
  await sleep(WAIT_MS);

  const web = await searchFromGeneralWeb(member);
  if (web) return web;

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

async function main() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const members = JSON.parse(raw);

  let filled = 0;
  let stillMissing = 0;
  let skipped = 0;

  await mapWithConcurrency(
    members,
    async (member, index) => {
      const hasImage = String(member.image || "").trim();
      if (hasImage) {
        skipped += 1;
        return;
      }

      const found = await resolveImage(member);
      if (found?.url) {
        member.image = found.url;
        member.imageSource = found.source;
        member.imageSourceUrl = found.sourceUrl;
        member.aiGuess = !["wikipedia", "wikidata-commons", "official-profile", "official-manual", "party-site"].includes(found.source);
        filled += 1;
        console.log(`filled: ${member.name} -> ${found.source}`);
      } else {
        stillMissing += 1;
        console.log(`missing: ${member.name}`);
      }

      if ((index + 1) % 10 === 0) {
        console.log(`progress: ${index + 1}/${members.length} filled=${filled} missing=${stillMissing}`);
      }
      await sleep(WAIT_MS);
    },
    CONCURRENCY
  );

  fs.writeFileSync(dataPath, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`auto-image-fetch: skipped=${skipped} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
