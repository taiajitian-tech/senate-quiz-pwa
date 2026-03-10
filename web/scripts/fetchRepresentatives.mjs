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
    image: ""
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
        _source: sourceUrl
      });
    }
  });

  console.log(`party-header-tables: ${sourceUrl} -> ${matchedTables}`);
  return results;
}

async function fetchPage(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache"
    }
  });

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

  const outDir = path.resolve("public/data");
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(
    path.join(outDir, "representatives.json"),
    JSON.stringify(finalRows, null, 2),
    "utf8"
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
