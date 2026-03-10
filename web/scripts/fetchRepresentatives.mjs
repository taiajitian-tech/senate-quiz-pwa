
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

const PARTY_KEYWORDS = [
  "自民", "自由民主党",
  "立民", "立憲民主党",
  "維新", "日本維新の会",
  "公明", "公明党",
  "国民", "国民民主党",
  "共産", "日本共産党",
  "れいわ", "れ新",
  "有志", "無所属", "無",
  "社民", "教育", "保守", "参政"
];

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  return normalizeText(value).replace(/君$/u, "").trim();
}

function hasKanji(value) {
  return /[\u4E00-\u9FFF々]/u.test(value);
}

function isMostlyHiragana(value) {
  const s = normalizeText(value).replace(/[ 　]/g, "");
  if (!s) return false;
  if (!/^[ぁ-んーゔゞゝ゜]+$/u.test(s)) return false;
  return s.length >= 3;
}

function isPartyLike(value) {
  const s = normalizeText(value);
  if (!s) return false;
  if (s.length > 20) return false;
  if (/[0-9]/.test(s)) return false;
  return PARTY_KEYWORDS.some((kw) => s.includes(kw));
}

function isNameLike(value) {
  const s = normalizeText(value);
  if (!s) return false;
  if (s.length < 2 || s.length > 30) return false;
  if (/[0-9]/.test(s)) return false;
  if (/氏名|ふりがな|会派|選挙区|当選回数|現在|あ行|か行|さ行|た行|な行|は行|ま行|や行|ら行|わ行/u.test(s)) return false;
  if (isMostlyHiragana(s)) return false;
  if (!hasKanji(s)) return false;
  return true;
}

function collectCellTexts($, tr) {
  return $(tr)
    .find("td, th")
    .map((_, cell) => normalizeText($(cell).text()))
    .get()
    .filter(Boolean);
}

async function main() {
  const res = await fetch(URL, {
    headers: { "user-agent": "Mozilla/5.0" }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const result = [];
  const seen = new Set();
  const debugRows = [];

  $("tr").each((_, tr) => {
    const cells = collectCellTexts($, tr);
    if (cells.length < 2) return;

    if (debugRows.length < 12) {
      debugRows.push(cells.join(" | "));
    }

    let name = "";
    let kana = "";
    let party = "";

    for (const cell of cells) {
      if (!kana && isMostlyHiragana(cell)) {
        kana = cell;
        continue;
      }
      if (!party && isPartyLike(cell)) {
        party = cell;
        continue;
      }
    }

    for (const cell of cells) {
      if (isNameLike(cell)) {
        const cleaned = cleanName(cell);
        if (cleaned && cleaned !== party && cleaned !== kana) {
          name = cleaned;
          break;
        }
      }
    }

    if (!name || !kana) return;

    const key = `${name}__${kana}`;
    if (seen.has(key)) return;
    seen.add(key);

    result.push({
      name,
      kana,
      house: "衆議院",
      party,
      role: "",
      image: ""
    });
  });

  if (result.length === 0) {
    const preview = debugRows.length ? debugRows.join("\n") : "(no tr rows found)";
    throw new Error(`No representatives extracted from page.\nSample rows:\n${preview}`);
  }

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "representatives.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");

  console.log("representatives:", result.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
