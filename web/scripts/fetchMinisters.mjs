import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fetch from "node-fetch";
import * as cheerio from "cheerio";
import { resolveKanteiMeiboUrls } from "./kanteiMeibo.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_FILE = path.resolve(__dirname, "../public/data/ministers.json");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";

function normalizeWhitespace(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCompact(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/[\s\u3000]+/gu, "")
    .trim();
}

function toPlainName(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, "")
    .replace(/^#\s*/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function stableId(name) {
  const seed = `ministers:${name}`;
  let hash = 0;
  for (const ch of seed) hash = (hash * 131 + ch.codePointAt(0)) % 90000000;
  return 10000000 + hash;
}

function readExisting() {
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function buildExistingMap(items) {
  const byName = new Map();
  for (const item of items) {
    const key = normalizeCompact(item?.name);
    if (!key) continue;
    byName.set(key, item);
  }
  return byName;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "user-agent": USER_AGENT },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function absoluteUrl(raw, base) {
  try {
    return new URL(raw, base).href;
  } catch {
    return "";
  }
}

function uniqueStrings(items) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = normalizeWhitespace(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

function textLinesFromHtml(html) {
  return html
    .replace(/<br\s*\/?>/giu, "\n")
    .replace(/<\/li>/giu, "\n")
    .replace(/<\/p>/giu, "\n")
    .replace(/<\/div>/giu, "\n")
    .replace(/<\/section>/giu, "\n")
    .replace(/<\/h[1-6]>/giu, "\n")
    .replace(/<[^>]+>/gu, " ")
    .split(/\n+/u)
    .map(normalizeWhitespace)
    .filter(Boolean);
}

function isHouseLine(line) {
  return line === "衆議院" || line === "参議院";
}

function looksLikeNameLine(line) {
  if (!line.includes("（") || !line.includes("）")) return false;
  if (/(第２次高市内閣|閣僚名簿|副大臣名簿|大臣政務官名簿|内閣ページに戻る|プロフィール)/u.test(line)) return false;
  return true;
}

function parseIndexEntries(html) {
  const $ = cheerio.load(html);
  const detailLinks = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!/\/meibo\/daijin\/.+\.html(?:[?#].*)?$/u.test(href)) return;
    detailLinks.push(absoluteUrl(href, "https://www.kantei.go.jp"));
  });

  const lines = textLinesFromHtml(html);
  const start = lines.findIndex((line) => line.includes("閣僚名簿"));
  const end = lines.findIndex((line, idx) => idx > start && /副大臣名簿|大臣政務官名簿|内閣ページに戻る/u.test(line));
  const slice = lines.slice(start >= 0 ? start : 0, end >= 0 ? end : lines.length);

  const entries = [];
  let pendingRoles = [];
  for (const line of slice) {
    if (/^(第２次高市内閣|閣僚等名簿|令和.*発足|職名|氏名|備考)$/u.test(line)) continue;
    if (looksLikeNameLine(line)) {
      entries.push({
        name: toPlainName(line),
        group: uniqueStrings(pendingRoles).join(" / "),
        house: "",
      });
      pendingRoles = [];
      continue;
    }
    if (isHouseLine(line) && entries.length > 0 && !entries[entries.length - 1].house) {
      entries[entries.length - 1].house = line;
      continue;
    }
    if (/^ツイート$|^facebookシェアする$|^LINEで送る$/u.test(line)) continue;
    pendingRoles.push(line.replace(/^・\s*/u, ""));
  }

  return entries.map((entry, index) => ({ ...entry, detailUrl: detailLinks[index] || "" }));
}

function parseDetailPage(html, url) {
  const $ = cheerio.load(html);
  const heading = toPlainName($("h1").first().text() || $("title").first().text() || "");
  const lines = textLinesFromHtml(html);
  const profileIndex = lines.findIndex((line) => line === "プロフィール");
  const headingIndex = lines.findIndex((line) => normalizeCompact(line).includes(normalizeCompact(heading)));
  const between = lines.slice(headingIndex >= 0 ? headingIndex + 1 : 0, profileIndex >= 0 ? profileIndex : lines.length);
  const roleLines = [];
  for (const line of between) {
    if (/^顔写真/u.test(line)) continue;
    if (/^第２次高市内閣/u.test(line)) continue;
    if (/^ツイート$|^facebookシェアする$|^LINEで送る$/u.test(line)) continue;
    roleLines.push(line);
  }

  let house = "";
  if (lines.includes("衆議院議員")) house = "衆議院";
  else if (lines.includes("参議院議員")) house = "参議院";

  let image = $("img[alt*='顔写真']").first().attr("src") || "";
  if (!image) {
    $("img[src]").each((_, el) => {
      const src = $(el).attr("src") || "";
      if (image) return;
      if (!/\/content\//u.test(src)) return;
      image = src;
    });
  }

  return {
    name: heading,
    detailUrl: url,
    group: uniqueStrings(roleLines).join(" / "),
    house,
    image: absoluteUrl(image, url),
  };
}

function mergeEntry(indexEntry, detailEntry, previous) {
  const name = detailEntry.name || indexEntry.name || previous?.name || "";
  const roles = uniqueStrings([
    ...String(indexEntry.group || "").split(" / ").map(normalizeWhitespace).filter(Boolean),
    ...String(detailEntry.group || "").split(" / ").map(normalizeWhitespace).filter(Boolean),
  ]);
  const house =
    indexEntry.house ||
    detailEntry.house ||
    (previous?.group?.includes("参議院") ? "参議院" : previous?.group?.includes("衆議院") ? "衆議院" : "");
  const group = uniqueStrings([...roles, house]).join(" / ");
  const images = detailEntry.image
    ? [detailEntry.image]
    : Array.isArray(previous?.images)
      ? previous.images.filter((img) => typeof img === "string" && img.trim())
      : [];

  return {
    id: Number(previous?.id) || stableId(name),
    name,
    group,
    images,
  };
}

async function main() {
  const existing = readExisting();
  const existingByName = buildExistingMap(existing);

  let indexHtml = "";
  let indexUrl = "";
  try {
    const resolved = await resolveKanteiMeiboUrls();
    indexUrl = resolved.ministersIndexUrl;
    console.log(`ministers source: ${indexUrl}`);
    indexHtml = await fetchText(indexUrl);
  } catch (err) {
    console.warn("ministers fetch failed, keep existing:", err?.message || err);
    console.log(`ministers kept: ${existing.length}`);
    return;
  }

  const indexEntries = parseIndexEntries(indexHtml);
  if (indexEntries.length < 20) {
    console.warn(`ministers parse suspicious (${indexEntries.length}), keep existing`);
    console.log(`ministers kept: ${existing.length}`);
    return;
  }

  const merged = [];
  for (const indexEntry of indexEntries) {
    let detailEntry = { name: "", group: "", house: "", image: "", detailUrl: indexEntry.detailUrl };
    if (indexEntry.detailUrl) {
      try {
        const detailHtml = await fetchText(indexEntry.detailUrl);
        detailEntry = parseDetailPage(detailHtml, indexEntry.detailUrl);
      } catch (err) {
        console.warn(`minister detail failed (${indexEntry.detailUrl}): ${err?.message || err}`);
      }
    }

    const nameKey = normalizeCompact(detailEntry.name || indexEntry.name);
    const previous = existingByName.get(nameKey);
    const item = mergeEntry(indexEntry, detailEntry, previous);
    if (!item.name || !item.group || !Array.isArray(item.images) || item.images.length === 0) {
      console.warn(`minister item suspicious (${item.name || "unknown"}), keep previous if available`);
      if (previous) merged.push(previous);
      continue;
    }
    merged.push(item);
  }

  if (merged.length < 20) {
    console.warn(`ministers merged suspicious (${merged.length}), keep existing`);
    console.log(`ministers kept: ${existing.length}`);
    return;
  }

  fs.writeFileSync(DATA_FILE, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  console.log(`ministers: ${merged.length}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
