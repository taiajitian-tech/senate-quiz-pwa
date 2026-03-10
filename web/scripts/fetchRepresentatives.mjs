import fs from "fs";
import path from "path";
import { load } from "cheerio";

const URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

const PARTY_KEYWORDS = [
  "自民", "自由民主党",
  "立民", "立憲民主党",
  "維新", "日本維新の会",
  "公明", "公明党",
  "国民", "国民民主党",
  "共産", "日本共産党",
  "れいわ", "れ新",
  "有志", "無所属",
  "社民", "参政", "保守", "教育"
];

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\u3000/g, " ")
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function cleanName(value) {
  return normalizeText(value)
    .replace(/\s+/g, " ")
    .replace(/君$/u, "")
    .trim();
}

function cleanKana(value) {
  return normalizeText(value).replace(/\s+/g, "");
}

function cleanParty(value) {
  return normalizeText(value);
}

function hasKanji(value) {
  return /[\u4E00-\u9FFF々ヶヵ]/u.test(value);
}

function isHeaderLike(value) {
  return /氏名|ふりがな|会派|選挙区|当選回数|議員一覧|衆議院|ただいまメンテナンス中/u.test(value);
}

function isNameLike(value) {
  const s = normalizeText(value);
  if (!s || s.length < 2 || s.length > 40) return false;
  if (isHeaderLike(s)) return false;
  if (/[0-9０-９]/.test(s)) return false;
  if (isKanaLike(s) || isPartyLike(s)) return false;
  return hasKanji(s);
}

function isKanaLike(value) {
  const s = cleanKana(value);
  return !!s && /^[ぁ-んーゔゞゝ゜]+$/u.test(s);
}

function isPartyLike(value) {
  const s = normalizeText(value);
  if (!s || s.length > 40) return false;
  return PARTY_KEYWORDS.some((kw) => s.includes(kw));
}

function isWinsLike(value) {
  const s = normalizeText(value);
  return /^[0-9０-９]{1,2}$/.test(s);
}

function scoreDecodedHtml(html) {
  let score = 0;
  for (const token of ["氏名", "ふりがな", "会派", "選挙区", "当選回数", "衆議院"]) {
    if (html.includes(token)) score += 3;
  }
  if (/逢沢|青木|青柳|青山/u.test(html)) score += 2;
  if (html.includes("����")) score -= 10;
  return score;
}

function decodeHtml(buffer) {
  const candidates = ["shift_jis", "utf-8", "euc-jp"];
  let best = { encoding: "utf-8", html: buffer.toString("utf8"), score: -Infinity };

  for (const encoding of candidates) {
    try {
      const html = new TextDecoder(encoding).decode(buffer);
      const score = scoreDecodedHtml(html);
      if (score > best.score) {
        best = { encoding, html, score };
      }
    } catch {}
  }

  return best;
}

function makeRecord(name, kana, party) {
  const cleanedName = cleanName(name);
  const cleanedKana = cleanKana(kana);
  const cleanedParty = cleanParty(party);

  if (!isNameLike(cleanedName)) return null;
  if (!isKanaLike(cleanedKana)) return null;
  if (!isPartyLike(cleanedParty)) return null;

  return {
    name: cleanedName,
    kana: cleanedKana,
    house: "衆議院",
    party: cleanedParty,
    role: "",
    image: ""
  };
}

function dedupe(records) {
  return Array.from(new Map(records.map((item) => [`${item.name}__${item.kana}`, item])).values());
}

function extractByDirectRows($) {
  const records = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td, th")
      .map((__, cell) => normalizeText($(cell).text()))
      .get()
      .filter(Boolean);

    if (cells.length < 5) return;

    for (let i = 0; i <= cells.length - 5; i += 1) {
      const record = makeRecord(cells[i], cells[i + 1], cells[i + 2]);
      if (!record) continue;
      if (!isWinsLike(cells[i + 4])) continue;
      records.push(record);
      break;
    }
  });

  return dedupe(records);
}

function extractByTokenSequence($) {
  const tokens = $("td, th")
    .map((_, cell) => normalizeText($(cell).text()))
    .get()
    .filter(Boolean)
    .filter((token) => !isHeaderLike(token));

  const records = [];

  for (let i = 0; i <= tokens.length - 5; i += 1) {
    const record = makeRecord(tokens[i], tokens[i + 1], tokens[i + 2]);
    if (!record) continue;
    if (!isWinsLike(tokens[i + 4])) continue;
    records.push(record);
  }

  return dedupe(records);
}

function extractByPlainText(html) {
  const text = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/tr>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\u00a0/g, " ");

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean)
    .filter((line) => !isHeaderLike(line));

  const records = [];

  for (const line of lines) {
    const parts = line
      .split(/[|｜;,，]/)
      .map((part) => normalizeText(part))
      .filter(Boolean);

    if (parts.length >= 5) {
      for (let i = 0; i <= parts.length - 5; i += 1) {
        const record = makeRecord(parts[i], parts[i + 1], parts[i + 2]);
        if (!record) continue;
        if (!isWinsLike(parts[i + 4])) continue;
        records.push(record);
        break;
      }
      continue;
    }

    const match = line.match(/^(?<name>[^0-9]{2,40}?君?)\s+(?<kana>[ぁ-んーゔゞゝ゜\s]+)\s+(?<party>[^0-9\s]{1,20})\s+(?<district>.+?)\s+(?<wins>[0-9０-９]{1,2})$/u);
    if (!match?.groups) continue;

    const record = makeRecord(match.groups.name, match.groups.kana, match.groups.party);
    if (!record) continue;
    records.push(record);
  }

  return dedupe(records);
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
      pragma: "no-cache"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const decoded = decodeHtml(buffer);
  const html = decoded.html;

  if (/ただいまメンテナンス中です|This site is under maintenance\./u.test(html)) {
    throw new Error(`Source page returned maintenance response (${decoded.encoding})`);
  }

  const $ = load(html);

  const byDirectRows = extractByDirectRows($);
  const byTokenSequence = extractByTokenSequence($);
  const byPlainText = extractByPlainText(html);

  const merged = dedupe([
    ...byDirectRows,
    ...byTokenSequence,
    ...byPlainText
  ]);

  merged.sort((a, b) => a.kana.localeCompare(b.kana, "ja"));

  console.log("encoding:", decoded.encoding);
  console.log("directRows:", byDirectRows.length);
  console.log("tokenSequence:", byTokenSequence.length);
  console.log("plainText:", byPlainText.length);
  console.log("representatives:", merged.length);

  if (merged.length < 400) {
    throw new Error(`Too few representatives extracted: ${merged.length}`);
  }

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "representatives.json");
  fs.writeFileSync(outFile, JSON.stringify(merged, null, 2), "utf8");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
