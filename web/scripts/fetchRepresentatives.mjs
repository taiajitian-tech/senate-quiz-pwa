import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const PARTY_INDEX_URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/kaiha_m.htm";
const LIST_PAGE_URLS = Array.from({ length: 10 }, (_, i) => `https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/${i + 1}giin.htm`);
const PARTY_PAGE_SEEDS = [
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/011kaiha.htm", "自由民主党・無所属の会"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/023kaiha.htm", "中道改革連合・無所属"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/025kaiha.htm", "立憲民主党・無所属"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/030kaiha.htm", "日本維新の会"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/040kaiha.htm", "国民民主党・無所属クラブ"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/050kaiha.htm", "参政党"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/060kaiha.htm", "チームみらい"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/070kaiha.htm", "日本共産党"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/080kaiha.htm", "有志の会"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/090kaiha.htm", "参政党"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/100kaiha.htm", "日本保守党"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/103kaiha.htm", "減税保守こども"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/110kaiha.htm", "無所属"],
  ["https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/999kaiha.htm", "無所属"],
];

const PARTY_PATTERN = /(自由民主党・無所属の会|自由民主党|自民|中道改革連合・無所属|中道|立憲民主党・無所属|立憲民主党|立民|日本維新の会|維新|国民民主党・無所属クラブ|国民民主党|国民|公明党|公明|参政党|参政|日本共産党|共産|れいわ新選組|れ新|社民党|社民|有志の会|有志|日本保守党|保守|減税保守こども|チームみらい|無所属)/u;

function normalizeSpace(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanName(value) {
  return normalizeSpace(value)
    .replace(/君$/u, "")
    .replace(/\s+/g, "")
    .trim();
}

function cleanKana(value) {
  return normalizeSpace(value)
    .replace(/\s+/g, "")
    .trim();
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

function isNameLike(value) {
  const s = cleanName(value);
  if (!s) return false;
  if (s.length < 2 || s.length > 20) return false;
  if (/氏名|ふりがな|会派|選挙区|当選回数|議員一覧|衆議院|会派別議員一覧/u.test(s)) return false;
  if (/\d/.test(s)) return false;
  return /[一-龠々ヶヵぁ-んァ-ヴ]/u.test(s);
}

function isKanaLike(value) {
  const s = cleanKana(value);
  if (!s) return false;
  return /^[ぁ-んゔー・]+$/u.test(s);
}

function isPartyLike(value) {
  return PARTY_PATTERN.test(cleanParty(value));
}

function isWinsLike(value) {
  return /^\d{1,2}(?:（[^）]+）)?$/u.test(cleanWins(value));
}

function scoreDecodedText(text) {
  let score = 0;
  for (const token of ["氏名", "ふりがな", "会派", "選挙区", "当選回数", "衆議院", "議員一覧", "会派別議員一覧"]) {
    if (text.includes(token)) score += 2;
  }
  for (const token of ["逢沢", "青木", "青柳", "自民", "立民", "維新"]) {
    if (text.includes(token)) score += 1;
  }
  if (text.includes("����")) score -= 10;
  return score;
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
      if (score > best.score) {
        best = { encoding, text, score };
      }
    } catch {
      // ignore
    }
  }
  return best;
}

function looksMaintenance(text) {
  const s = normalizeSpace(text);
  return s.includes("ただいまメンテナンス中です") || s.includes("This site is under maintenance");
}

function normalizePageText(html) {
  return String(html)
    .replace(/\r/g, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|table|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function parsePartyNameFromHeading(text, fallback = "") {
  const m = text.match(/会派別議員一覧[（(]([^）)]+)[）)]/u);
  if (m?.[1]) return cleanParty(m[1]);
  return cleanParty(fallback);
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

function extractFromListDom(html, sourceLabel) {
  const $ = cheerio.load(html);
  const results = [];
  const seen = new Set();

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td,th")
      .map((__, cell) => normalizeSpace($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length !== 5) return;
    const [rawName, rawKana, rawParty, rawDistrict, rawWins] = cells;
    if (rawName === "氏名" || rawKana === "ふりがな") return;
    if (!isNameLike(rawName) || !isKanaLike(rawKana) || !isPartyLike(rawParty) || !cleanDistrict(rawDistrict) || !isWinsLike(rawWins)) return;

    addRecord(results, seen, {
      name: rawName,
      kana: rawKana,
      party: rawParty,
      _source: sourceLabel
    });
  });

  return results;
}

function extractFromPartyDom(html, fallbackParty, sourceLabel) {
  const $ = cheerio.load(html);
  const titleText = normalizePageText($.root().text());
  const party = parsePartyNameFromHeading(titleText, fallbackParty);
  const results = [];
  const seen = new Set();

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td,th")
      .map((__, cell) => normalizeSpace($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 3 || cells.length > 4) return;
    if (cells[0] === "氏名" || cells[1] === "ふりがな") return;

    const [rawName, rawKana, rawDistrict, rawWins = "1"] = cells;
    if (!isNameLike(rawName) || !isKanaLike(rawKana) || !cleanDistrict(rawDistrict)) return;
    if (cells.length === 4 && !isWinsLike(rawWins)) return;

    addRecord(results, seen, {
      name: rawName,
      kana: rawKana,
      party,
      _source: sourceLabel
    });
  });

  return results;
}

function extractLinksFromIndexHtml(html) {
  const links = [];
  const seen = new Set();
  const $ = cheerio.load(html);

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    const text = normalizeSpace($(a).text());
    if (!/\/syu\/\d{2,3}kaiha\.htm$/i.test(href)) return;
    const url = new URL(href, PARTY_INDEX_URL).href;
    const party = cleanParty(text.replace(/^会派別議員一覧/u, ""));
    const key = `${url}__${party}`;
    if (seen.has(key)) return;
    seen.add(key);
    links.push({ url, party: party || "" });
  });

  const regex = /href=["']([^"']+\/syu\/\d{2,3}kaiha\.htm)["'][^>]*>([^<]+)/giu;
  for (const m of html.matchAll(regex)) {
    const url = new URL(m[1], PARTY_INDEX_URL).href;
    const party = cleanParty(m[2]);
    const key = `${url}__${party}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push({ url, party: party || "" });
  }

  return links;
}

function extractFromDelimitedLines(text, expectedFields, fixedParty = "") {
  const results = [];
  const seen = new Set();
  const normalized = text
    .replace(/[；;]/g, "\n")
    .replace(/[|｜]/g, ",")
    .replace(/[，､]/g, ",")
    .replace(/[。．]/g, "\n")
    .replace(/\n{2,}/g, "\n");

  const lines = normalized.split("\n").map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (/^氏名$|^ふりがな$|^会派$|^選挙区$|^当選回数$/u.test(line)) continue;
    const parts = line.split(/\s*,\s*/).map((v) => v.trim()).filter(Boolean);
    if (parts.length !== expectedFields) continue;

    if (expectedFields === 5) {
      const [rawName, rawKana, rawParty, rawDistrict, rawWins] = parts;
      if (!isNameLike(rawName) || !isKanaLike(rawKana) || !isPartyLike(rawParty) || !cleanDistrict(rawDistrict) || !isWinsLike(rawWins)) continue;
      addRecord(results, seen, { name: rawName, kana: rawKana, party: rawParty });
    } else if (expectedFields === 4) {
      const [rawName, rawKana, rawDistrict, rawWins] = parts;
      if (!isNameLike(rawName) || !isKanaLike(rawKana) || !cleanDistrict(rawDistrict) || !isWinsLike(rawWins)) continue;
      addRecord(results, seen, { name: rawName, kana: rawKana, party: fixedParty });
    }
  }
  return results;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
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
  return { url, contentType, encoding: decoded.encoding, text: decoded.text };
}

async function collectPartyPages() {
  const discovered = [];
  try {
    const indexPage = await fetchText(PARTY_INDEX_URL);
    console.log(`party-index: ${indexPage.url}`);
    console.log(`party-index-encoding: ${indexPage.encoding}`);
    console.log(`party-index-type: ${indexPage.contentType || "(none)"}`);
    const links = extractLinksFromIndexHtml(indexPage.text);
    console.log(`party-links-discovered: ${links.length}`);
    discovered.push(...links);
  } catch (error) {
    console.log(`party-index-error: ${error.message}`);
  }

  const merged = new Map();
  for (const [url, party] of PARTY_PAGE_SEEDS) {
    merged.set(url, { url, party });
  }
  for (const item of discovered) {
    const prev = merged.get(item.url);
    merged.set(item.url, { url: item.url, party: item.party || prev?.party || "" });
  }
  return [...merged.values()];
}

async function main() {
  const all = [];
  const globalSeen = new Set();

  const partyPages = await collectPartyPages();
  console.log(`party-pages-total: ${partyPages.length}`);

  for (const page of partyPages) {
    try {
      const fetched = await fetchText(page.url);
      console.log(`party-page: ${page.url}`);
      console.log(`party-page-encoding: ${fetched.encoding}`);
      const domRows = extractFromPartyDom(fetched.text, page.party, page.url);
      const textRows = domRows.length ? [] : extractFromDelimitedLines(normalizePageText(fetched.text), 4, page.party);
      const rows = domRows.length >= textRows.length ? domRows : textRows;
      console.log(`party-page-count: ${page.url} -> ${rows.length}`);
      for (const row of rows) addRecord(all, globalSeen, row);
    } catch (error) {
      console.log(`party-page-error: ${page.url} -> ${error.message}`);
    }
  }

  console.log(`party-route-total: ${all.length}`);

  for (const url of LIST_PAGE_URLS) {
    try {
      const fetched = await fetchText(url);
      console.log(`list-page: ${url}`);
      console.log(`list-page-encoding: ${fetched.encoding}`);
      const domRows = extractFromListDom(fetched.text, url);
      const textRows = domRows.length ? [] : extractFromDelimitedLines(normalizePageText(fetched.text), 5, "");
      const rows = domRows.length >= textRows.length ? domRows : textRows;
      console.log(`list-page-count: ${url} -> ${rows.length}`);
      for (const row of rows) addRecord(all, globalSeen, row);
    } catch (error) {
      console.log(`list-page-error: ${url} -> ${error.message}`);
    }
  }

  console.log(`representatives: ${all.length}`);

  if (all.length < 400) {
    throw new Error(`Too few representatives extracted: ${all.length}`);
  }

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "representatives.json");
  fs.writeFileSync(outFile, JSON.stringify(all, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
