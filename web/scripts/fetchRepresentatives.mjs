import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT = path.resolve(__dirname, "../public/data/representatives.json");

const PAGE_URLS = Array.from({ length: 10 }, (_, i) => `https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/${i + 1}giin.htm`);
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function normalizeWhitespace(text) {
  return String(text ?? "").replace(/\u00a0/g, " ").replace(/[\t\r]+/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeName(text) {
  return normalizeWhitespace(text)
    .replace(/君$/u, "")
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
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

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function looksLikeHouseListPage(text) {
  return text.includes("氏名") && text.includes("ふりがな") && text.includes("会派");
}

function parseByRows(html) {
  const $ = cheerio.load(html);
  const items = [];

  $("tr").each((_, tr) => {
    const cells = $(tr).find("th, td").map((__, el) => normalizeWhitespace($(el).text())).get().filter(Boolean);
    if (cells.length < 3) return;
    if (cells[0] === "氏名" || cells.join(" ").includes("ふりがな") || cells.join(" ").includes("当選回数")) return;

    const name = normalizeName(cells[0]);
    const group = normalizeWhitespace(cells[2]);
    if (!name || !group) return;
    items.push({ name, group });
  });

  return items;
}

function parseByText(html) {
  const text = normalizeWhitespace(cheerio.load(html)("body").text());
  if (!looksLikeHouseListPage(text)) return [];

  const re = /([一-龥ぁ-んァ-ヶ々〆ヵヶー\-・\s]+?)君[,、]?\s*([ぁ-んァ-ヶー\s]+?)\.\s*([^\.]+?)\.\s*([^\.]+?)\.\s*([0-9０-９（参比）()\-〜～・]+)(?=\s+[一-龥ぁ-んァ-ヶ々〆ヵヶー\-・\s]+?君|$)/gu;
  const items = [];
  for (const m of text.matchAll(re)) {
    const name = normalizeName(m[1]);
    const group = normalizeWhitespace(m[3]);
    if (!name || !group) continue;
    items.push({ name, group });
  }
  return items;
}

function uniqueByName(items) {
  const map = new Map();
  for (const item of items) {
    if (!item.name || map.has(item.name)) continue;
    map.set(item.name, item);
  }
  return [...map.values()];
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
    { query: `${name} site:go.jp`, allowed: (u) => /(^|\.)go\.jp\//.test(u) },
    { query: `${name} 衆議院議員 公式サイト`, allowed: (u) => !/wikipedia\.org/.test(u) },
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
      // continue
    }
  }

  return "";
}

async function main() {
  const all = [];

  for (const url of PAGE_URLS) {
    try {
      const html = await fetchText(url);
      const rows = parseByRows(html);
      const parsed = rows.length > 0 ? rows : parseByText(html);
      if (parsed.length === 0) {
        console.warn(`No representatives parsed from ${url}`);
        continue;
      }
      all.push(...parsed);
    } catch (error) {
      console.warn(`Skip ${url}: ${String(error)}`);
    }
  }

  const base = uniqueByName(all);
  if (base.length === 0) {
    throw new Error("No representatives parsed from shugiin pages");
  }

  const enriched = [];
  for (const [index, item] of base.entries()) {
    const imageUrl = await resolveFallbackImage(item.name);
    enriched.push({
      id: index + 1,
      name: item.name,
      group: item.group,
      images: imageUrl ? [imageUrl] : [],
    });
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(enriched, null, 2) + "\n", "utf8");
  console.log(`representatives written: ${enriched.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
