import fs from "node:fs";
import path from "node:path";
import { load } from "cheerio";

const dataPath = path.resolve("public/data/representatives.json");
const TIMEOUT_MS = 15000;
const WAIT_MS = 500;

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
  return String(value || "").replace(/\s+/g, " ").trim();
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

function scoreImageCandidate(src, alt = "", name = "") {
  const s = String(src || "");
  const a = String(alt || "");
  if (!/^https?:\/\//i.test(s)) return -100;
  if (!/\.(jpg|jpeg|png|webp|svg)(\?|$)/i.test(s)) return -10;
  let score = 0;
  if (/portrait|profile|face|kao|photo|member|giin|politician|article|upload|commons|headshot/i.test(s)) score += 2;
  if (/logo|icon|banner|spacer|line|pixel|print|btn|button|share|ogp-default/i.test(s)) score -= 4;
  if (name && (a.includes(name) || decodeURIComponentSafe(s).includes(name))) score += 3;
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
          sourceUrl: `https://www.wikidata.org/wiki/${encodeURIComponent(String(id))}`
        };
      }
    } catch {
      // continue
    }
  }
  return null;
}

function looksPoliticianPage(text, name) {
  const s = normalizeSpace(text);
  let score = 0;
  if (name && s.includes(name)) score += 3;
  for (const token of ["衆議院", "議員", "公式", "プロフィール", "自由民主党", "立憲民主党", "公明党", "維新", "国民民主党", "共産党", "れいわ"]) {
    if (s.includes(token)) score += 1;
  }
  return score >= 4;
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

function extractOgImage(html, pageUrl, name) {
  const $ = load(html);
  const urls = [];
  for (const sel of ['meta[property="og:image"]', 'meta[name="og:image"]', 'meta[name="twitter:image"]', 'meta[property="twitter:image"]']) {
    $(sel).each((_, el) => {
      const v = normalizeUrl($(el).attr("content") || "", pageUrl);
      if (v) urls.push(v);
    });
  }
  const img = urls.find((u) => scoreImageCandidate(u, "", name) > 0);
  return img || "";
}

async function searchWebImage(name) {
  try {
    const query = encodeURIComponent(`${name} 衆議院議員 公式 プロフィール`);
    const html = await fetchPage(`https://duckduckgo.com/html/?q=${query}`);
    const targets = extractDuckDuckGoTargets(html).slice(0, 5);
    for (const target of targets) {
      try {
        const pageHtml = await fetchPage(target);
        if (!looksPoliticianPage(pageHtml, name)) continue;
        const img = extractOgImage(pageHtml, target, name);
        if (!img) continue;
        return {
          url: img,
          source: "web-fallback",
          sourceUrl: target
        };
      } catch {
        // continue
      }
    }
  } catch {
    // continue
  }
  return null;
}

async function resolveImage(name) {
  const wikipedia = await searchWikipediaImage(name);
  if (wikipedia) return wikipedia;

  await sleep(WAIT_MS);

  const commons = await searchWikidataCommonsImage(name);
  if (commons) return commons;

  await sleep(WAIT_MS);

  const web = await searchWebImage(name);
  if (web) return web;

  return null;
}

async function main() {
  const raw = fs.readFileSync(dataPath, "utf8");
  const members = JSON.parse(raw);

  let filled = 0;
  let stillMissing = 0;

  for (const member of members) {
    if (String(member.image || "").trim()) continue;

    const found = await resolveImage(member.name);
    if (found?.url) {
      member.image = found.url;
      member.imageSource = found.source;
      member.imageSourceUrl = found.sourceUrl;
      member.aiGuess = found.source === "web-fallback";
      filled += 1;
      console.log(`filled: ${member.name} -> ${found.source}`);
    } else {
      stillMissing += 1;
      console.log(`missing: ${member.name}`);
    }

    await sleep(WAIT_MS);
  }

  fs.writeFileSync(dataPath, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`auto-image-fetch: filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
