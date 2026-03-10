import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

const PARTY_KEYWORDS = [
  "自民", "立民", "維新", "公明", "共産", "国民", "有志", "れ新", "保守", "社民", "参政", "無所属",
  "自由民主党", "立憲民主党", "日本維新の会", "公明党", "日本共産党", "国民民主党", "れいわ新選組",
  "日本保守党", "社会民主党", "参政党", "無所属"
];

function normalizeText(value) {
  return String(value ?? "")
    .replace(/　/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHonorific(value) {
  return normalizeText(value).replace(/君$/u, "").trim();
}

function hasJapanese(text) {
  return /[一-龠々ぁ-んァ-ヶ]/u.test(text);
}

function isKanaCandidate(text) {
  const s = normalizeText(text);
  if (!s) return false;
  if (s.length < 3 || s.length > 40) return false;
  if (/[0-9０-９]/u.test(s)) return false;
  const cleaned = s.replace(/[ 　]/g, "");
  if (!cleaned) return false;
  return /^[ぁ-んー・]+$/u.test(cleaned);
}

function isPartyCandidate(text) {
  const s = normalizeText(text);
  if (!s) return false;
  if (s.length > 30) return false;
  if (/[0-9０-９]/u.test(s)) return false;
  return PARTY_KEYWORDS.some((keyword) => s.includes(keyword));
}

function isNameCandidate(text) {
  const raw = normalizeText(text);
  if (!raw) return false;
  if (!hasJapanese(raw)) return false;
  if (/[0-9０-９]/u.test(raw)) return false;
  if (isKanaCandidate(raw)) return false;
  if (isPartyCandidate(raw)) return false;
  const s = stripHonorific(raw);
  if (!s) return false;
  if (s.length < 2 || s.length > 30) return false;
  if (/^(氏名|ふりがな|会派|選挙区|当選回数)$/u.test(s)) return false;
  return /[一-龠々]/u.test(s);
}

function extractFromRow(cellTexts) {
  const cells = cellTexts.map(normalizeText).filter(Boolean);
  if (cells.length < 2) return null;

  let name = "";
  let kana = "";
  let party = "";

  for (const cell of cells) {
    if (!name && isNameCandidate(cell)) {
      name = stripHonorific(cell);
      continue;
    }
    if (!kana && isKanaCandidate(cell)) {
      kana = normalizeText(cell);
      continue;
    }
    if (!party && isPartyCandidate(cell)) {
      party = normalizeText(cell);
      continue;
    }
  }

  if (!name || !kana) return null;
  return {
    name,
    kana,
    house: "衆議院",
    party,
    role: "",
    image: ""
  };
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en;q=0.9"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const maintenanceMarkers = ["ただいまメンテナンス中", "This site is under maintenance"];
  if (maintenanceMarkers.some((marker) => html.includes(marker))) {
    throw new Error("Source page returned maintenance content");
  }

  const $ = cheerio.load(html);
  const result = [];
  const seen = new Set();

  $("tr").each((_, tr) => {
    const cellTexts = $(tr)
      .children("th, td")
      .map((__, cell) => normalizeText($(cell).text()))
      .get();

    const item = extractFromRow(cellTexts);
    if (!item) return;

    const key = `${item.name}__${item.kana}`;
    if (seen.has(key)) return;
    seen.add(key);
    result.push(item);
  });

  if (result.length === 0) {
    throw new Error("No representatives extracted from page");
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
