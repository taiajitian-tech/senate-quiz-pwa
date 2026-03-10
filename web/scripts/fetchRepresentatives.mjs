import fs from "fs";
import path from "path";
import { load } from "cheerio";

const LIST_PAGE_URLS = Array.from(
  { length: 10 },
  (_, i) => `https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/${i + 1}giin.htm`
);

const PARTY_INDEX_URL =
  "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/kaiha_m.htm";

const EXPECTED_HEADERS_LIST = ["氏名", "ふりがな", "会派", "選挙区", "当選回数"];
const EXPECTED_HEADERS_PARTY = ["氏名", "ふりがな", "選挙区", "当選回数"];

const MIN_EXPECTED = 430;
const MAX_EXPECTED = 520;
const IMAGE_CONCURRENCY = 6;
const FETCH_TIMEOUT_MS = 12000;

const PARTY_PATTERN =
  /(自由民主党・無所属の会|自由民主党|自民|立憲民主党・無所属|立憲民主党|立民|日本維新の会|維新|公明党|公明|国民民主党・無所属クラブ|国民民主党|国民|日本共産党|共産|れいわ新選組|れ新|参政党|参政|社民党|社民|有志の会|有志|日本保守党|保守|無所属)/u;

function normalizeSpace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanName(value) {
  return normalizeSpace(value).replace(/君$/u, "").replace(/\s+/g, "");
}

function cleanKana(value) {
  return normalizeSpace(value).replace(/\s+/g, "");
}

function cleanParty(value) {
  return normalizeSpace(value);
}

function cleanDistrict(value) {
  return normalizeSpace(value);
}

function cleanWins(value) {
  return normalizeSpace(value).replace(/\s+/g, "");
}

function decodeHtml(buffer, contentType = "") {
  const ctype = String(contentType).toLowerCase();
  const candidates = [];
  if (ctype.includes("shift_jis") || ctype.includes("shift-jis") || ctype.includes("sjis")) {
    candidates.push("shift_jis");
  }
  candidates.push("utf-8", "shift_jis", "euc-jp");

  let best = { encoding: "utf-8", text: buffer.toString("utf8"), score: -Infinity };
  for (const encoding of [...new Set(candidates)]) {
    try {
      const text = new TextDecoder(encoding).decode(buffer);
      const score = scoreDecodedText(text);
      if (score > best.score) best = { encoding, text, score };
    } catch {
      // ignore
    }
  }
  return best;
}

function scoreDecodedText(text) {
  let score = 0;
  for (const token of ["氏名", "ふりがな", "会派", "選挙区", "当選回数", "衆議院", "議員一覧"]) {
    if (text.includes(token)) score += 2;
  }
  for (const token of ["逢沢", "青木", "青柳", "自民", "立民", "維新"]) {
    if (text.includes(token)) score += 1;
  }
  if (text.includes("����")) score -= 10;
  return score;
}

function looksMaintenance(text) {
  const s = normalizeSpace(text);
  return s.includes("ただいまメンテナンス中です") || s.includes("This site is under maintenance");
}

function isNameLike(value) {
  const s = cleanName(value);
  if (!s) return false;
  if (/氏名|ふりがな|会派|選挙区|当選回数|議員一覧|衆議院|会派別議員一覧/u.test(s)) return false;
  if (/\d/.test(s)) return false;
  return /[一-龠々ヶヵぁ-んァ-ヴ]/u.test(s);
}

function isKanaLike(value) {
  const s = cleanKana(value);
  return /^[ぁ-んゔー・]+$/u.test(s);
}

function isPartyLike(value) {
  return PARTY_PATTERN.test(cleanParty(value));
}

function isWinsLike(value) {
  return /^\d{1,2}(?:（[^）]+）)?$/u.test(cleanWins(value));
}

function getDirectRows($, table) {
  const direct = [];
  $(table)
    .children()
    .each((_, child) => {
      const tag = child.tagName?.toLowerCase();
      if (tag === "tr") {
        direct.push(child);
      } else if (tag === "tbody" || tag === "thead") {
        $(child)
          .children("tr")
          .each((__, tr) => direct.push(tr));
      }
    });
  return direct;
}

function getDirectCells($, tr) {
  return $(tr)
    .children("th,td")
    .map((_, cell) => normalizeSpace($(cell).text()))
    .get();
}

function headerMatches(cells, expected) {
  if (cells.length !== expected.length) return false;
  return expected.every((label, i) => normalizeSpace(cells[i]) === label);
}

function toAbsoluteUrl(href, baseUrl) {
  if (!href) return "";
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return "";
  }
}

function addRecord(results, seen, record) {
  const name = cleanName(record.name);
  const kana = cleanKana(record.kana);
  const party = cleanParty(record.party);
  if (!isNameLike(name) || !isKanaLike(kana) || !party) return;

  const key = `${name}__${kana}`;
  if (seen.has(key)) return;
  seen.add(key);

  results.push({
    name,
    kana,
    house: "衆議院",
    party,
    role: "",
    image: "",
    imageSource: "",
    imageSourceUrl: "",
    profileUrl: record.profileUrl || ""
  });
}

function extractProfileUrlFromNameCell($, row, baseUrl) {
  const firstCell = $(row).children("th,td").first();
  const href = firstCell.find("a[href]").first().attr("href") || "";
  return toAbsoluteUrl(href, baseUrl);
}

function extractFromListPage(html, sourceUrl) {
  const $ = load(html);
  const results = [];
  const seen = new Set();
  let matchedTables = 0;

  $("table").each((_, table) => {
    const rows = getDirectRows($, table);
    if (rows.length < 2) return;

    const header = getDirectCells($, rows[0]);
    if (!headerMatches(header, EXPECTED_HEADERS_LIST)) return;
    matchedTables += 1;

    for (const row of rows.slice(1)) {
      const cells = getDirectCells($, row).filter(Boolean);
      if (cells.length !== 5) continue;

      const [rawName, rawKana, rawParty, rawDistrict, rawWins] = cells;
      if (!isNameLike(rawName)) continue;
      if (!isKanaLike(rawKana)) continue;
      if (!isPartyLike(rawParty)) continue;
      if (!cleanDistrict(rawDistrict)) continue;
      if (!isWinsLike(rawWins)) continue;

      addRecord(results, seen, {
        name: rawName,
        kana: rawKana,
        party: rawParty,
        profileUrl: extractProfileUrlFromNameCell($, row, sourceUrl),
        _source: sourceUrl
      });
    }
  });

  console.log(`list-header-tables: ${sourceUrl} -> ${matchedTables}`);
  return results;
}

function parsePartyNameFromDocument($, fallback = "") {
  const rootText = normalizeSpace($.root().text());
  const m = rootText.match(/会派別議員一覧[（(]([^）)]+)[）)]/u);
  return cleanParty(m?.[1] || fallback);
}

function extractPartyLinks(indexHtml) {
  const $ = load(indexHtml);
  const links = [];
  const seen = new Set();

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/syu\/\d{2,3}kaiha\.htm$/i.test(href)) return;

    const url = new URL(href, PARTY_INDEX_URL).href;
    const text = cleanParty($(a).text().replace(/^会派別議員一覧/u, ""));
    if (!text) return;

    const key = `${url}__${text}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ url, party: text });
  });

  return links;
}

function extractFromPartyPage(html, fallbackParty, sourceUrl) {
  const $ = load(html);
  const party = parsePartyNameFromDocument($, fallbackParty);
  const results = [];
  const seen = new Set();
  let matchedTables = 0;

  $("table").each((_, table) => {
    const rows = getDirectRows($, table);
    if (rows.length < 2) return;

    const header = getDirectCells($, rows[0]);
    if (!headerMatches(header, EXPECTED_HEADERS_PARTY)) return;
    matchedTables += 1;

    for (const row of rows.slice(1)) {
      const cells = getDirectCells($, row).filter(Boolean);

      if (cells.length !== 4) continue;

      const [rawName, rawKana, rawDistrict, rawWins] = cells;
      if (!isNameLike(rawName)) continue;
      if (!isKanaLike(rawKana)) continue;
      if (!cleanDistrict(rawDistrict)) continue;
      if (!isWinsLike(rawWins)) continue;

      addRecord(results, seen, {
        name: rawName,
        kana: rawKana,
        party,
        profileUrl: extractProfileUrlFromNameCell($, row, sourceUrl),
        _source: sourceUrl
      });
    }
  });

  console.log(`party-header-tables: ${sourceUrl} -> ${matchedTables}`);
  return results;
}

async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchPage(url) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
    },
    FETCH_TIMEOUT_MS
  );

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${url}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get("content-type") ?? "";
  const decoded = decodeHtml(buffer, contentType);

  console.log(`page: ${url}`);
  console.log(`page-type: ${contentType || "(none)"}`);
  console.log(`page-encoding: ${decoded.encoding}`);

  if (looksMaintenance(decoded.text)) {
    console.log(`maintenance-like-response: ${url}`);
  }

  return decoded.text;
}

function withinExpectedRange(count) {
  return count >= MIN_EXPECTED && count <= MAX_EXPECTED;
}

async function collectFromListPages() {
  const all = [];
  const seen = new Set();

  for (const url of LIST_PAGE_URLS) {
    try {
      const html = await fetchPage(url);
      const rows = extractFromListPage(html, url);
      console.log(`list-page-count: ${url} -> ${rows.length}`);
      for (const row of rows) addRecord(all, seen, row);
    } catch (error) {
      console.log(`list-page-error: ${url} -> ${error.message}`);
    }
  }

  console.log(`list-route-total: ${all.length}`);
  return all;
}

async function collectFromPartyPages() {
  const all = [];
  const seen = new Set();

  let links = [];
  try {
    const html = await fetchPage(PARTY_INDEX_URL);
    links = extractPartyLinks(html);
    console.log(`party-links-discovered: ${links.length}`);
  } catch (error) {
    console.log(`party-index-error: ${error.message}`);
  }

  for (const { url, party } of links) {
    try {
      const html = await fetchPage(url);
      const rows = extractFromPartyPage(html, party, url);
      console.log(`party-page-count: ${url} -> ${rows.length}`);
      for (const row of rows) addRecord(all, seen, row);
    } catch (error) {
      console.log(`party-page-error: ${url} -> ${error.message}`);
    }
  }

  console.log(`party-route-total: ${all.length}`);
  return all;
}

function isLikelyImageUrl(url) {
  if (!url || typeof url !== "string") return false;
  return /^https?:\/\//i.test(url) && /(\.jpe?g|\.png|\.webp|\.gif)(?:$|[?#])/i.test(url);
}

function scoreImageCandidate(url, sourceUrl, name) {
  const u = String(url || "").toLowerCase();
  const s = String(sourceUrl || "").toLowerCase();
  let score = 0;

  if (s.includes("shugiin.go.jp") || u.includes("shugiin.go.jp")) score += 100;
  if (s.includes("wikipedia.org") || s.includes("wikimedia.org") || u.includes("wikimedia.org")) score += 80;
  if (u.includes("/thumb/")) score -= 10;
  if (u.includes("icon") || u.includes("logo") || u.includes("banner") || u.includes("spacer")) score -= 50;
  if (name) {
    const compact = name.replace(/\s+/g, "").toLowerCase();
    if (compact && (u.includes(compact) || s.includes(compact))) score += 8;
  }

  return score;
}

function pickBestImage(candidates, name) {
  const ranked = candidates
    .filter((candidate) => isLikelyImageUrl(candidate.url))
    .map((candidate) => ({
      ...candidate,
      score: scoreImageCandidate(candidate.url, candidate.sourceUrl, name)
    }))
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

function extractImagesFromOfficialHtml(html, baseUrl, name) {
  const $ = load(html);
  const candidates = [];

  $("img[src]").each((_, img) => {
    const src = toAbsoluteUrl($(img).attr("src"), baseUrl);
    const alt = normalizeSpace($(img).attr("alt") || "");
    const title = normalizeSpace($(img).attr("title") || "");
    const width = Number($(img).attr("width") || 0);
    const height = Number($(img).attr("height") || 0);

    if (!isLikelyImageUrl(src)) return;
    if (width > 0 && width < 80) return;
    if (height > 0 && height < 80) return;
    if (/(logo|icon|banner|spacer|arrow|pdf)/i.test(src)) return;

    let bonus = 0;
    const metaText = `${alt} ${title}`;
    if (metaText.includes(name)) bonus += 30;
    if (src.includes("/giin/")) bonus += 20;
    if (src.includes("/member/")) bonus += 15;

    candidates.push({
      url: src,
      source: "official",
      sourceUrl: baseUrl,
      score: 100 + bonus
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

async function tryOfficialImage(profileUrl, name) {
  if (!profileUrl) return null;
  try {
    const html = await fetchPage(profileUrl);
    return extractImagesFromOfficialHtml(html, profileUrl, name);
  } catch (error) {
    console.log(`official-image-error: ${name} -> ${error.message}`);
    return null;
  }
}

async function fetchJson(url) {
  const res = await fetchWithTimeout(
    url,
    {
      headers: {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
        accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        "accept-language": "ja,en-US;q=0.9,en;q=0.8",
        "cache-control": "no-cache",
        pragma: "no-cache"
      }
    },
    FETCH_TIMEOUT_MS
  );
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${url}`);
  }
  return await res.json();
}

function stripDisambiguation(title) {
  return cleanName(String(title || "").replace(/\s*[（(].*?[）)]\s*$/u, ""));
}

async function searchWikipediaTitle(name) {
  try {
    const url = `https://ja.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(
      name
    )}&limit=5&namespace=0&format=json&origin=*`;
    const json = await fetchJson(url);
    const titles = Array.isArray(json?.[1]) ? json[1] : [];
    const title = titles.find((item) => stripDisambiguation(item) === name) || titles[0] || "";
    return typeof title === "string" ? title : "";
  } catch (error) {
    console.log(`wikipedia-search-error: ${name} -> ${error.message}`);
    return "";
  }
}

async function tryWikipediaImage(name) {
  const title = (await searchWikipediaTitle(name)) || name;

  try {
    const url = `https://ja.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
    const json = await fetchJson(url);
    const actualTitle = cleanName(stripDisambiguation(json?.title || title));
    if (actualTitle && actualTitle !== name) {
      console.log(`wikipedia-title-mismatch: ${name} -> ${actualTitle}`);
      return null;
    }

    const imageUrl =
      json?.originalimage?.source ||
      json?.thumbnail?.source ||
      "";

    if (!isLikelyImageUrl(imageUrl)) return null;

    return {
      url: imageUrl,
      source: "wikipedia",
      sourceUrl: `https://ja.wikipedia.org/wiki/${encodeURIComponent(json?.title || title)}`
    };
  } catch (error) {
    console.log(`wikipedia-image-error: ${name} -> ${error.message}`);
    return null;
  }
}

function extractFallbackImageCandidates(html, sourceUrl, name) {
  const $ = load(html);
  const candidates = [];

  $("img[src]").each((_, img) => {
    const src = $(img).attr("src") || "";
    const dataSrc = $(img).attr("data-src") || "";
    const realSrc = src.startsWith("data:") ? dataSrc : src;
    const abs = toAbsoluteUrl(realSrc, sourceUrl);
    const alt = normalizeSpace($(img).attr("alt") || "");

    if (!isLikelyImageUrl(abs)) return;
    if (/(logo|icon|banner|spacer|emoji|sprite|thumb\/1\/1)/i.test(abs)) return;

    let score = 0;
    if (alt.includes(name)) score += 50;
    if (abs.toLowerCase().includes(name.toLowerCase())) score += 10;

    candidates.push({
      url: abs,
      source: "web-fallback",
      sourceUrl,
      score
    });
  });

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

async function tryWebFallback(name) {
  const queries = [
    `${name} 衆議院議員 公式`,
    `${name} 衆議院議員`,
    `${name} wikipedia`
  ];

  for (const query of queries) {
    try {
      const url = `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const html = await fetchPage(url);
      const candidates = extractFallbackImageCandidates(html, url, name);
      const best = pickBestImage(candidates, name);
      if (best && best.score >= 30) {
        return {
          url: best.url,
          source: "web-fallback",
          sourceUrl: best.sourceUrl
        };
      }
    } catch (error) {
      console.log(`web-fallback-error: ${name} -> ${error.message}`);
    }
  }

  return null;
}

async function resolveImageForRepresentative(item) {
  const official = await tryOfficialImage(item.profileUrl, item.name);
  if (official) return official;

  const wikipedia = await tryWikipediaImage(item.name);
  if (wikipedia) return wikipedia;

  const fallback = await tryWebFallback(item.name);
  if (fallback) return fallback;

  return {
    url: "",
    source: "",
    sourceUrl: item.profileUrl || ""
  };
}

async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length || 1) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function enrichImages(rows) {
  let officialCount = 0;
  let wikipediaCount = 0;
  let fallbackCount = 0;
  let emptyCount = 0;

  const enriched = await mapWithConcurrency(rows, IMAGE_CONCURRENCY, async (row, index) => {
    const image = await resolveImageForRepresentative(row);
    const next = {
      ...row,
      image: image.url || "",
      imageSource: image.source || "",
      imageSourceUrl: image.sourceUrl || row.profileUrl || ""
    };

    if (next.imageSource === "official") officialCount += 1;
    else if (next.imageSource === "wikipedia") wikipediaCount += 1;
    else if (next.imageSource === "web-fallback") fallbackCount += 1;
    else emptyCount += 1;

    console.log(
      `image-progress: ${index + 1}/${rows.length} ${row.name} -> ${next.imageSource || "none"}`
    );

    return next;
  });

  console.log(`image-source-counts: official=${officialCount} wikipedia=${wikipediaCount} web=${fallbackCount} empty=${emptyCount}`);
  return enriched;
}

async function main() {
  const listRows = await collectFromListPages();

  let finalRows = listRows;
  let selectedRoute = "list";

  if (!withinExpectedRange(listRows.length)) {
    const partyRows = await collectFromPartyPages();

    if (withinExpectedRange(partyRows.length)) {
      finalRows = partyRows;
      selectedRoute = "party";
    } else {
      const merged = [];
      const seen = new Set();
      for (const row of [...listRows, ...partyRows]) addRecord(merged, seen, row);

      console.log(`merged-route-total: ${merged.length}`);
      if (withinExpectedRange(merged.length)) {
        finalRows = merged;
        selectedRoute = "merged";
      } else {
        throw new Error(
          `Representative count out of expected range. list=${listRows.length} party=${partyRows.length} merged=${merged.length}`
        );
      }
    }
  }

  console.log(`selected-route: ${selectedRoute}`);
  console.log(`representatives: ${finalRows.length}`);

  if (!withinExpectedRange(finalRows.length)) {
    throw new Error(`Representative count out of expected range: ${finalRows.length}`);
  }

  const enrichedRows = await enrichImages(finalRows);

  const outDir = path.resolve("public/data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "representatives.json"),
    JSON.stringify(enrichedRows, null, 2),
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
