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
const TIMEOUT_MS = 12000;

const EXISTING_JSON_PATH = path.resolve("public/data/representatives.json");

const MANUAL_IMAGE_OVERRIDES = {
  "青山周平": {
    image: "https://www.jimin.jp/member/img/aoyama-shyuhei.jpg",
    imageSource: "official-manual",
    imageSourceUrl: "https://www.jimin.jp/member/102126.html"
  },
  "赤澤亮正": {
    image: "https://www.jimin.jp/member/img/akazawa-ryosei.jpg",
    imageSource: "official-manual",
    imageSourceUrl: "https://www.jimin.jp/member/100478.html"
  },
  "あかま二郎": {
    image: "https://www.jimin.jp/member/img/akama-jiro.jpg",
    imageSource: "official-manual",
    imageSourceUrl: "https://www.jimin.jp/member/102081.html"
  }
};

const MANUAL_BAD_IMAGE_REMOVALS = new Set([
  "安藤たかお"
]);


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

function normalizeUrl(url, baseUrl) {
  if (!url) return "";
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return "";
  }
}

function extractProfileUrlFromRow($, row, baseUrl) {
  const href = $(row).find("td:first-child a[href]").first().attr("href") || "";
  return normalizeUrl(href, baseUrl);
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
        profileUrl: extractProfileUrlFromRow($, row, sourceUrl),
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
        profileUrl: extractProfileUrlFromRow($, row, sourceUrl),
        _source: sourceUrl
      });
    }
  });

  console.log(`party-header-tables: ${sourceUrl} -> ${matchedTables}`);
  return results;
}


function loadExistingImageCache() {
  try {
    if (!fs.existsSync(EXISTING_JSON_PATH)) return new Map();
    const parsed = JSON.parse(fs.readFileSync(EXISTING_JSON_PATH, "utf8"));
    const out = new Map();
    for (const row of Array.isArray(parsed) ? parsed : []) {
      const key = `${cleanName(row?.name)}__${cleanKana(row?.kana)}`;
      if (!key || !row?.image) continue;
      out.set(key, {
        image: row.image,
        imageSource: row.imageSource || "cached",
        imageSourceUrl: row.imageSourceUrl || row.profileUrl || "",
        profileUrl: row.profileUrl || ""
      });
    }
    return out;
  } catch (error) {
    console.log(`existing-cache-error: ${error.message}`);
    return new Map();
  }
}

function getOverrideImage(name) {
  return MANUAL_IMAGE_OVERRIDES[cleanName(name)] || null;
}

function getCachedImage(cache, row) {
  const key = `${cleanName(row?.name)}__${cleanKana(row?.kana)}`;
  const hit = cache.get(key) || null;
  if (!hit) return null;
  if (MANUAL_BAD_IMAGE_REMOVALS.has(cleanName(row?.name))) return null;
  if (hit.imageSource === "web-fallback") return null;
  return hit;
}

function extractSearchTargetsFromBing(html, allowedDomains = []) {
  const $ = load(html);
  const out = [];
  const seen = new Set();
  $("a[href]").each((_, a) => {
    const href = normalizeSpace($(a).attr("href") || "");
    if (!/^https?:\/\//i.test(href)) return;
    if (/(\/images\/|bing\.com\/ck\/a\?|microsoft|go\.microsoft)/i.test(href)) return;
    if (allowedDomains.length) {
      try {
        const hostname = new URL(href).hostname.toLowerCase();
        if (!allowedDomains.some((d) => hostname === d || hostname.endsWith(`.${d}`))) return;
      } catch {
        return;
      }
    }
    if (seen.has(href)) return;
    seen.add(href);
    out.push(href);
  });
  return out;
}

async function searchTargetsBing(query, allowedDomains = []) {
  try {
    const html = await fetchPage(`https://www.bing.com/search?q=${encodeURIComponent(query)}`);
    return extractSearchTargetsFromBing(html, allowedDomains);
  } catch (error) {
    console.log(`bing-search-error: ${query} -> ${error.message}`);
    return [];
  }
}

async function resolveJiminMemberImage(name) {
  const targets = await searchTargetsBing(`site:jimin.jp/member ${name}`, ["jimin.jp"]);
  for (const target of targets) {
    if (!/https?:\/\/(www\.)?jimin\.jp\/member\/\d+\.html$/i.test(target)) continue;
    const official = await resolveOfficialImage(target, name);
    if (official?.url) return official;
  }
  return null;
}

async function resolveWikipediaImageVariants(name) {
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
  return null;
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

async function fetchPage(url) {
  const res = await fetchRaw(url, "html");
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

async function fetchJson(url) {
  const res = await fetchRaw(url, "json");
  return await res.json();
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

function scoreImageCandidate(src, alt = "", name = "") {
  const s = String(src || "");
  const a = String(alt || "");
  if (!/^https?:\/\//i.test(s)) return -100;
  if (!/\.(jpg|jpeg|png|webp)(\?|$)/i.test(s)) return -10;
  let score = 0;
  if (/portrait|profile|face|kao|photo|member|giin|politician|article|upload|commons/i.test(s)) score += 2;
  if (/logo|icon|banner|spacer|line|pixel|print|btn|button|share/i.test(s)) score -= 4;
  if (name && (a.includes(name) || decodeURIComponentSafe(s).includes(name))) score += 3;
  return score;
}

function decodeURIComponentSafe(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveOfficialImage(profileUrl, name) {
  if (!profileUrl) return null;
  try {
    const html = await fetchPage(profileUrl);
    const $ = load(html);
    const candidates = [];
    $("img[src]").each((_, img) => {
      const src = normalizeUrl($(img).attr("src") || "", profileUrl);
      const alt = normalizeSpace($(img).attr("alt") || $(img).attr("title") || "");
      const score = scoreImageCandidate(src, alt, name);
      if (score > 0) candidates.push({ src, alt, score });
    });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates[0]) {
      return {
        url: candidates[0].src,
        source: "official",
        sourceUrl: profileUrl
      };
    }
  } catch (error) {
    console.log(`image-official-error: ${name} -> ${error.message}`);
  }
  return null;
}

async function resolveWikipediaImage(name) {
  const direct = await resolveWikipediaImageVariants(name);
  if (direct) return direct;

  const searchQueries = [
    `intitle:${name} 政治家`,
    `"${name}" 衆議院議員`,
    `"${name}" 政治家`
  ];
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
    } catch (error) {
      console.log(`image-wikipedia-error: ${name} -> ${error.message}`);
    }
  }
  return null;
}

function looksPoliticianPage(text, name) {
  const s = normalizeSpace(text);
  let score = 0;
  if (name && s.includes(name)) score += 3;
  for (const token of ["衆議院", "議員", "公式", "プロフィール", "自由民主党", "立憲民主党", "公明党", "日本維新", "国民民主党", "日本共産党", "れいわ新選組"]) {
    if (s.includes(token)) score += 1;
  }
  return score >= 4;
}

function extractOgImage(html, pageUrl, name) {
  const $ = load(html);
  const metas = [
    'meta[property="og:image"]',
    'meta[name="og:image"]',
    'meta[name="twitter:image"]',
    'meta[property="twitter:image"]'
  ];
  const urls = [];
  for (const sel of metas) {
    $(sel).each((_, el) => {
      const v = normalizeUrl($(el).attr("content") || "", pageUrl);
      if (v) urls.push(v);
    });
  }
  const img = urls.find((u) => scoreImageCandidate(u, "", name) > 0);
  return img || "";
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

async function resolveWebFallbackImage(name) {
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
      } catch (error) {
        console.log(`image-web-page-error: ${name} -> ${target} -> ${error.message}`);
      }
    }
  } catch (error) {
    console.log(`image-web-search-error: ${name} -> ${error.message}`);
  }
  return null;
}

async function resolveImageForRepresentative(rep, existingCache) {
  if (MANUAL_BAD_IMAGE_REMOVALS.has(cleanName(rep.name))) {
    return { url: "", source: "", sourceUrl: "" };
  }

  const override = getOverrideImage(rep.name);
  if (override?.image) {
    return {
      url: override.image,
      source: override.imageSource,
      sourceUrl: override.imageSourceUrl
    };
  }

  const official = await resolveOfficialImage(rep.profileUrl, rep.name);
  if (official) return official;

  if (String(rep.party || "").includes("自由民主党")) {
    const jimin = await resolveJiminMemberImage(rep.name);
    if (jimin) return jimin;
  }

  const wikipedia = await resolveWikipediaImage(rep.name);
  if (wikipedia) return wikipedia;

  const cached = getCachedImage(existingCache, rep);
  if (cached?.image) {
    return {
      url: cached.image,
      source: cached.imageSource || "cached",
      sourceUrl: cached.imageSourceUrl || cached.profileUrl || ""
    };
  }

  const webFallback = await resolveWebFallbackImage(rep.name);
  if (webFallback) return webFallback;

  return { url: "", source: "", sourceUrl: "" };
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

async function enrichImages(rows, existingCache) {
  const counts = { official: 0, wikipedia: 0, web: 0, cached: 0, empty: 0 };
  const enriched = await mapWithConcurrency(
    rows,
    async (row, i) => {
      const image = await resolveImageForRepresentative(row, existingCache);
      const next = {
        ...row,
        image: image.url,
        imageSource: image.source,
        imageSourceUrl: image.sourceUrl,
        aiGuess: image.source === "web-fallback"
      };
      if (image.source === "official") counts.official += 1;
      else if (image.source === "wikipedia") counts.wikipedia += 1;
      else if (image.source === "web-fallback") counts.web += 1;
      else if (image.source === "cached" || image.source === "official-manual") counts.cached += 1;
      else counts.empty += 1;
      console.log(`image-progress: ${i + 1}/${rows.length} ${row.name} -> ${image.source || "empty"}`);
      return next;
    },
    IMAGE_CONCURRENCY
  );
  console.log(
    `image-source-counts: official=${counts.official} wikipedia=${counts.wikipedia} web=${counts.web} cached=${counts.cached} empty=${counts.empty}`
  );
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

  const existingCache = loadExistingImageCache();
  console.log(`existing-image-cache: ${existingCache.size}`);
  const finalWithImages = await enrichImages(finalRows, existingCache);

  const outDir = path.resolve("public/data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "representatives.json"),
    JSON.stringify(finalWithImages, null, 2),
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
