import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, "../public/data/ministers.json");

const CURRENT_MEIBO_URL = "https://www.kantei.go.jp/jp/105/meibo/index.html";
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function normalizeWhitespace(text) {
  return String(text ?? "").replace(/\u00a0/g, " ").replace(/[\t\r]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(text) {
  return normalizeWhitespace(text)
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[：:].*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(url, base) {
  if (!url) return "";
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function isChamberLine(text) {
  return text === "衆議院" || text === "参議院";
}

function isPersonLine(text) {
  return /（[^）]+）/.test(text) || /\([^)]*\)/.test(text);
}

function isStopLine(text) {
  return (
    text.includes("副大臣名簿") ||
    text.includes("大臣政務官名簿") ||
    text.includes("内閣総理大臣補佐官名簿") ||
    text.includes("内閣ページに戻る")
  );
}

function parseMainTextLines(html) {
  const $ = cheerio.load(html);
  const bodyText = $("body").text();
  return bodyText
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);
}

function parseProfileLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const map = new Map();
  $('a[href*="/meibo/daijin/"]').each((_, a) => {
    const href = toAbsoluteUrl($(a).attr("href"), baseUrl);
    if (!href) return;
    const text = normalizeName($(a).text());
    if (!text) return;
    if (!map.has(text)) map.set(text, href);
  });
  return map;
}

function parseEntriesFromLines(lines) {
  const start = lines.findIndex((line) => line === "職名 氏名 備考");
  if (start === -1) throw new Error("Could not locate minister list start on current cabinet page");

  const entries = [];
  let roleLines = [];

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isStopLine(line)) break;
    if (line === "第２次高市内閣 閣僚名簿" || line === "令和８年２月１８日発足") continue;
    if (line === "職名 氏名 備考") continue;

    if (isChamberLine(line) && entries.length > 0) {
      entries[entries.length - 1].chamber = line;
      continue;
    }

    if (isPersonLine(line)) {
      const chamberMatch = line.match(/(衆議院|参議院)$/);
      const chamber = chamberMatch ? chamberMatch[1] : "";
      const rawName = chamber ? line.slice(0, line.lastIndexOf(chamber)).trim() : line;
      const name = normalizeName(rawName);
      if (!name) continue;
      entries.push({
        name,
        role: roleLines.join(" / ").trim(),
        chamber,
      });
      roleLines = [];
      continue;
    }

    roleLines.push(line.replace(/^・\s*/, ""));
  }

  return entries;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractProfileData(html, url) {
  const $ = cheerio.load(html);
  const h1 = normalizeWhitespace($("h1").first().text());
  const name = normalizeName(h1);

  let imageUrl = "";
  const preferredImg = $("img[alt*='顔写真'], img[alt*='顔'], main img, article img").filter((_, img) => {
    const src = $(img).attr("src");
    if (!src) return false;
    return !/facebook|line|logo|banner|spacer/i.test(src);
  }).first();

  if (preferredImg.length > 0) {
    imageUrl = toAbsoluteUrl(preferredImg.attr("src"), url);
  }

  return { name, imageUrl };
}

function extractBestImageFromGenericPage(html, url) {
  const $ = cheerio.load(html);

  const og = $('meta[property="og:image"], meta[name="og:image"]').attr("content");
  if (og) return toAbsoluteUrl(og, url);

  const twitter = $('meta[name="twitter:image"], meta[property="twitter:image"]').attr("content");
  if (twitter) return toAbsoluteUrl(twitter, url);

  const img = $("img").filter((_, el) => {
    const src = $(el).attr("src");
    if (!src) return false;
    if (/logo|banner|icon|btn|facebook|line|x-logo|header|footer|blank|spacer/i.test(src)) return false;
    const w = Number($(el).attr("width") || 0);
    const h = Number($(el).attr("height") || 0);
    if (w && h && (w < 120 || h < 120)) return false;
    return true;
  }).first();

  return img.length ? toAbsoluteUrl(img.attr("src"), url) : "";
}

async function searchDuckDuckGo(query) {
  const res = await fetch(DDG_HTML_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  return await res.text();
}

function extractSearchResults(html) {
  const $ = cheerio.load(html);
  const results = [];
  $("a.result__a, a[href]").each((_, a) => {
    const href = $(a).attr("href");
    const text = normalizeWhitespace($(a).text());
    const url = toAbsoluteUrl(href, DDG_HTML_URL);
    if (!url || !text) return;
    if (/duckduckgo\.com/.test(url)) return;
    results.push({ title: text, url });
  });
  return results;
}

async function resolveFallbackImage(name) {
  const searchPlans = [
    { query: `${name} site:kantei.go.jp`, allowed: (u) => /kantei\.go\.jp/.test(u) },
    { query: `${name} site:go.jp`, allowed: (u) => /(^|\.)go\.jp\//.test(u) },
    { query: `${name} 公式サイト`, allowed: (u) => !/wikipedia\.org/.test(u) },
    { query: `${name} Wikipedia`, allowed: (u) => /wikipedia\.org/.test(u) },
  ];

  for (const plan of searchPlans) {
    try {
      const html = await searchDuckDuckGo(plan.query);
      const results = extractSearchResults(html).filter((r) => plan.allowed(r.url));
      for (const result of results.slice(0, 5)) {
        try {
          const pageHtml = await fetchText(result.url);
          const imageUrl = extractBestImageFromGenericPage(pageHtml, result.url);
          if (imageUrl) return imageUrl;
        } catch {
          // continue
        }
      }
    } catch {
      // continue to next plan
    }
  }

  return "";
}

function stableIdFromName(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 1000000;
  return 9000000 + hash;
}

async function main() {
  const mainHtml = await fetchText(CURRENT_MEIBO_URL);
  const lines = parseMainTextLines(mainHtml);
  const entries = parseEntriesFromLines(lines);
  const profileLinks = parseProfileLinks(mainHtml, CURRENT_MEIBO_URL);

  const out = [];
  for (const entry of entries) {
    const profileUrl = profileLinks.get(entry.name) || "";
    let imageUrl = "";

    if (profileUrl) {
      try {
        const profileHtml = await fetchText(profileUrl);
        const profileData = extractProfileData(profileHtml, profileUrl);
        imageUrl = profileData.imageUrl;
      } catch {
        // fallback below
      }
    }

    if (!imageUrl) {
      imageUrl = await resolveFallbackImage(entry.name);
    }

    const group = [entry.role, entry.chamber].filter(Boolean).join(" / ");
    out.push({
      id: stableIdFromName(entry.name),
      name: entry.name,
      group,
      images: imageUrl ? [imageUrl] : [],
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`ministers.json generated (${out.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
