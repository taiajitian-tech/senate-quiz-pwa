import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const dataPath = path.resolve("public/data/representatives.json");
const TIMEOUT_MS = Number(process.env.REP_IMAGE_TIMEOUT_MS || 12000);
const WAIT_MS = Number(process.env.REP_IMAGE_WAIT_MS || 150);
const CONCURRENCY = Math.max(1, Number(process.env.REP_IMAGE_CONCURRENCY || 8));

const PARTY_SEARCH_HINTS = {
  "自由民主党・無所属の会": {
    domains: ["jimin.jp"],
    queries: ["site:jimin.jp member", "site:jimin.jp/member", "site:jimin.jp profile"]
  },
  "日本維新の会": {
    domains: ["o-ishin.jp"],
    queries: ["site:o-ishin.jp", "site:o-ishin.jp/member", "site:o-ishin.jp/sangiin"]
  },
  "国民民主党・無所属クラブ": {
    domains: ["new-kokumin.jp"],
    queries: ["site:new-kokumin.jp", "site:new-kokumin.jp/member", "site:new-kokumin.jp/news"]
  },
  "参政党": {
    domains: ["sanseito.jp"],
    queries: ["site:sanseito.jp", "site:sanseito.jp/member", "site:sanseito.jp/election"]
  },
  "日本共産党": {
    domains: ["jcp.or.jp"],
    queries: ["site:jcp.or.jp", "site:jcp.or.jp/member", "site:jcp.or.jp/web_policy"]
  },
  "チームみらい": {
    domains: ["team-mirai.jp"],
    queries: ["site:team-mirai.jp", "site:team-mirai.jp/member"]
  },
  "中道改革連合・無所属": {
    domains: [],
    queries: []
  },
  "無所属": {
    domains: [],
    queries: []
  }
};

const BAD_IMAGE_NAMES = new Set(["安藤たかお"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  return Buffer.from(await res.arrayBuffer()).toString("utf8");
}

function normalizeSpace(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(url, baseUrl = "") {
  const raw = String(url || "").trim();
  if (!raw) return "";
  if (/^data:/i.test(raw)) return "";
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

function cleanName(value) {
  return normalizeSpace(value).replace(/\s+/g, "");
}

function getPartyHint(party) {
  return PARTY_SEARCH_HINTS[party] || { domains: [], queries: [] };
}

function partyKeywords(party) {
  return String(party || "")
    .split(/[・\s]/)
    .map((x) => normalizeSpace(x))
    .filter(Boolean);
}

function scoreImageCandidate(src, alt = "", name = "", pageUrl = "") {
  const s = String(src || "");
  const a = String(alt || "");
  const p = String(pageUrl || "");
  if (!/^https?:\/\//i.test(s)) return -100;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(s)) return -20;

  let score = 0;
  const full = `${decodeURIComponentSafe(s)} ${decodeURIComponentSafe(a)} ${decodeURIComponentSafe(p)}`;

  if (/portrait|profile|face|kao|photo|member|giin|politician|candidate|profile_photo|headshot|本人|議員|顔/i.test(full)) score += 4;
  if (/logo|icon|banner|spacer|line|pixel|print|btn|button|share|ogp-default|noimage|default|placeholder/i.test(full)) score -= 8;
  if (/poster|ポスター|街宣|演説|のぼり|看板|選挙/i.test(full)) score -= 8;
  if (/twitter|x\.com|facebook|instagram|youtube/i.test(full)) score -= 4;
  if (/jimin\.jp|o-ishin\.jp|new-kokumin\.jp|sanseito\.jp|jcp\.or\.jp|team-mirai\.jp|wikipedia|wikimedia|commons/i.test(full)) score += 3;
  if (name && (full.includes(name) || full.includes(cleanName(name)))) score += 5;
  return score;
}

function scorePage(html, pageUrl, name, party) {
  const text = normalizeSpace(String(html || "").slice(0, 6000));
  let score = 0;
  if (name && text.includes(name)) score += 5;
  for (const token of ["衆議院", "議員", "プロフィール", "公式", "member", "profile"]) {
    if (text.includes(token)) score += 1;
  }
  for (const token of partyKeywords(party)) {
    if (token && text.includes(token)) score += 1;
  }
  if (/404|not found|ページが見つかりません|アクセスできません/i.test(text)) score -= 8;
  if (/facebook|instagram|youtube|x\.com|twitter/i.test(pageUrl)) score -= 4;
  return score;
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
          sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(wikiTitle)}`,
          aiGuess: false
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
        `https://ja.wikipedia.org/w/api.php?action=query&prop=pageimages&piprop=original|thumbnail&pithumbsize=800&titles=${encodeURIComponent(
          title
        )}&format=json&origin=*`
      );
      const pages = page?.query?.pages || {};
      const first = Object.values(pages)[0];
      const img = first?.original?.source || first?.thumbnail?.source || "";
      if (img) {
        return {
          url: img,
          source: "wikipedia",
          sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(title)}`,
          aiGuess: false
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
        const entityRes = await fetchJson(
          `https://www.wikidata.org/wiki/Special:EntityData/${encodeURIComponent(String(id))}.json`
        );
        const entity = entityRes?.entities?.[id];
        const fileName = entity?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
        if (!fileName) continue;
        const commonsFile = String(fileName).replace(/ /g, "_");
        return {
          url: `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(commonsFile)}`,
          source: "wikidata-commons",
          sourceUrl: `https://www.wikidata.org/wiki/${encodeURIComponent(String(id))}`,
          aiGuess: false
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

function extractDuckDuckGoTargets(html) {
  const $ = load(html);
  const out = [];
  const seen = new Set();

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!href.includes("uddg=")) return;
    const m = href.match(/[?&]uddg=([^&]+)/);
    const target = m ? decodeURIComponentSafe(m[1]) : "";
    if (!/^https?:\/\//i.test(target)) return;
    if (seen.has(target)) return;
    seen.add(target);
    out.push(target);
  });

  return out;
}

function extractImageCandidates(html, pageUrl, name) {
  const $ = load(html);
  const candidates = [];

  const pushCandidate = (url, alt = "") => {
    const normalized = normalizeUrl(url, pageUrl);
    if (!normalized) return;
    candidates.push({ url: normalized, alt, score: scoreImageCandidate(normalized, alt, name, pageUrl) });
  };

  for (const sel of [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]'
  ]) {
    $(sel).each((_, el) => pushCandidate($(el).attr("content") || "", "meta-image"));
  }

  const imgSelectors = [
    "main img",
    "article img",
    ".profile img",
    ".member img",
    ".entry img",
    ".post img",
    "#main img",
    "img"
  ];

  for (const sel of imgSelectors) {
    $(sel).each((_, img) => {
      pushCandidate($(img).attr("src") || "", $(img).attr("alt") || "");
      pushCandidate($(img).attr("data-src") || "", $(img).attr("alt") || "");
    });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

function makeSearchQueries(name, party) {
  const hint = getPartyHint(party);
  const base = [
    `"${name}" 衆議院議員`,
    `"${name}" 政治家`,
    `${name} 衆議院議員 公式 プロフィール`
  ];
  const partySpecific = hint.queries.map((q) => `${q} "${name}"`);
  return [...partySpecific, ...base];
}

function preferredDomain(url, party) {
  const hint = getPartyHint(party);
  return hint.domains.some((domain) => url.includes(domain));
}

async function searchWebImage(name, party) {
  const queries = makeSearchQueries(name, party);
  const visitedPages = new Set();

  for (const q of queries) {
    try {
      const query = encodeURIComponent(q);
      const html = await fetchPage(`https://duckduckgo.com/html/?q=${query}`);
      const targets = extractDuckDuckGoTargets(html);
      const orderedTargets = [
        ...targets.filter((url) => preferredDomain(url, party)),
        ...targets.filter((url) => !preferredDomain(url, party))
      ].slice(0, 8);

      for (const target of orderedTargets) {
        if (visitedPages.has(target)) continue;
        visitedPages.add(target);
        try {
          const pageHtml = await fetchPage(target);
          if (scorePage(pageHtml, target, name, party) < 4) continue;
          const candidates = extractImageCandidates(pageHtml, target, name);
          const best = candidates.find((candidate) => candidate.score >= 5);
          if (!best) continue;
          return {
            url: best.url,
            source: preferredDomain(target, party) ? "party-site" : "web-fallback",
            sourceUrl: target,
            aiGuess: true
          };
        } catch {
          // continue
        }
        await sleep(WAIT_MS);
      }
    } catch {
      // continue
    }
    await sleep(WAIT_MS);
  }
  return null;
}

async function resolveImage(member) {
  const name = member.name;
  const party = member.party || "";

  const wikipedia = await searchWikipediaImage(name);
  if (wikipedia) return wikipedia;
  await sleep(WAIT_MS);

  const commons = await searchWikidataCommonsImage(name);
  if (commons) return commons;
  await sleep(WAIT_MS);

  const web = await searchWebImage(name, party);
  if (web) return web;

  return null;
}

async function runPool(items, worker, concurrency) {
  let index = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (true) {
      const i = index;
      index += 1;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

async function main() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const members = JSON.parse(raw);

  const targets = members.filter((member) => !normalizeSpace(member.image) && !BAD_IMAGE_NAMES.has(member.name));
  let filled = 0;
  let stillMissing = 0;

  await runPool(
    targets,
    async (member) => {
      const found = await resolveImage(member);
      if (found?.url) {
        member.image = found.url;
        member.imageSource = found.source;
        member.imageSourceUrl = found.sourceUrl;
        member.aiGuess = Boolean(found.aiGuess);
        filled += 1;
        console.log(`filled: ${member.name} -> ${found.source}`);
      } else {
        stillMissing += 1;
        console.log(`missing: ${member.name}`);
      }
      await sleep(WAIT_MS);
    },
    CONCURRENCY
  );

  for (const member of members) {
    if (BAD_IMAGE_NAMES.has(member.name)) {
      member.image = "";
      member.imageSource = "";
      member.imageSourceUrl = "";
      member.aiGuess = true;
    }
  }

  fs.writeFileSync(dataPath, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`auto-image-fetch: filled=${filled} still-missing=${stillMissing} concurrency=${CONCURRENCY}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
