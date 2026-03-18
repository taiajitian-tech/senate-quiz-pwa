import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const PAGE_URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html",
  "https://www3.nhk.or.jp/news/special/election2024/",
];

const DATA_PATH = path.resolve("public/data/representatives.json");
const SEARCH_TARGETS_PATH = path.resolve("public/data/representatives-image-search-targets.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const MISSING_PATH = path.resolve("public/data/missing-images.json");

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function cleanName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[・･]/g, "")
    .replace(/[―－—–ー]/g, "-")
    .trim();
}

function pickTargets(members) {
  const fixTargets = readJsonIfExists(FIX_TARGETS_PATH, []);
  if (Array.isArray(fixTargets) && fixTargets.length > 0) {
    const names = [...new Set(fixTargets.map((x) => cleanName(x?.name)).filter(Boolean))];
    return { mode: "fix", names };
  }

  const searchTargets = readJsonIfExists(SEARCH_TARGETS_PATH, []);
  if (Array.isArray(searchTargets) && searchTargets.length > 0) {
    const names = [...new Set(searchTargets.map((x) => cleanName(x?.name)).filter(Boolean))];
    return { mode: "missing", names };
  }

  const missingTargets = readJsonIfExists(MISSING_PATH, []);
  if (Array.isArray(missingTargets) && missingTargets.length > 0) {
    const names = [...new Set(missingTargets.map((x) => cleanName(x?.name)).filter(Boolean))];
    return { mode: "missing", names };
  }

  const names = members
    .filter((m) => !m.image)
    .map((m) => cleanName(m.name))
    .filter(Boolean);

  return { mode: "missing", names: [...new Set(names)] };
}

function buildMemberIndex(members) {
  const map = new Map();
  for (const member of members) {
    const key = cleanName(member.name);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(member);
  }
  return map;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${url}`);
  }
  return await res.text();
}

function collectCandidatesFromPage(html, pageUrl) {
  const $ = cheerio.load(html);
  const found = [];

  $("img[alt][src]").each((_, el) => {
    const src = $(el).attr("src");
    const alt = $(el).attr("alt");
    if (!src || !alt) return;

    const name = cleanName(alt);
    if (!name) return;

    const image = new URL(src, pageUrl).toString();
    found.push({ name, image });
  });

  return found;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`representatives.json not found: ${DATA_PATH}`);
  }

  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
  const { mode, names: targetNames } = pickTargets(members);
  const targetSet = new Set(targetNames);
  const memberIndex = buildMemberIndex(members);

  console.log(`nhk-anyway mode=${mode} total=${members.length} targets=${targetSet.size}`);

  let visitedPages = 0;
  let rawMatches = 0;
  const byName = new Map();

  for (const pageUrl of PAGE_URLS) {
    try {
      const html = await fetchHtml(pageUrl);
      const bytes = Buffer.byteLength(html, "utf-8");
      console.log(`nhk-anyway page=${pageUrl} bytes=${bytes}`);

      const candidates = collectCandidatesFromPage(html, pageUrl);
      let pageMatches = 0;

      for (const item of candidates) {
        if (!targetSet.has(item.name)) continue;
        pageMatches += 1;
        rawMatches += 1;
        if (!byName.has(item.name)) byName.set(item.name, item);
      }

      console.log(`nhk-anyway page-matches=${pageMatches}`);
      visitedPages += 1;
    } catch (error) {
      console.log(`nhk-anyway page-failed=${pageUrl} error=${error?.message ?? String(error)}`);
    }
  }

  console.log(`nhk-anyway visited-pages=${visitedPages}`);
  console.log(`nhk-anyway raw-matches=${rawMatches}`);
  console.log(`nhk-anyway unique-matches=${byName.size}`);

  let filled = 0;

  for (const [name, item] of byName.entries()) {
    const targets = memberIndex.get(name) ?? [];
    if (targets.length !== 1) continue;

    const target = targets[0];
    if (!target.image || mode === "fix") {
      target.image = item.image;
      target.imageSource = "nhk";
      filled += 1;
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(members, null, 2));

  const stillMissing = [];
  for (const name of targetSet) {
    const targets = memberIndex.get(name) ?? [];
    const resolved = targets.some((m) => !!m.image);
    if (!resolved) {
      stillMissing.push(name);
      console.log(`missing: ${name}`);
    }
  }

  console.log(`nhk-anyway complete mode=${mode} filled=${filled} still-missing=${stillMissing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
