
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
  "有志", "無所属", "社民", "参政", "保守", "教育"
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

function isKanaLike(value) {
  const s = normalizeText(value).replace(/[ 　]/g, "");
  return !!s && /^[ぁ-んーゔゞゝ゜]+$/u.test(s) && s.length >= 3;
}

function isPartyLike(value) {
  const s = normalizeText(value);
  if (!s) return false;
  if (s.length > 24) return false;
  if (/[0-9]/.test(s)) return false;
  return PARTY_KEYWORDS.some((kw) => s.includes(kw));
}

function isNameLike(value) {
  const s = normalizeText(value);
  if (!s) return false;
  if (s.length < 2 || s.length > 30) return false;
  if (/[0-9]/.test(s)) return false;
  if (/氏名|ふりがな|会派|選挙区|当選回数|現在|議員一覧|あ行|か行|さ行|た行|な行|は行|ま行|や行|ら行|わ行/u.test(s)) return false;
  if (isKanaLike(s)) return false;
  if (isPartyLike(s)) return false;
  return hasKanji(s);
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

function collectCells($, tr) {
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

  const buffer = Buffer.from(await res.arrayBuffer());
  const decoded = decodeHtml(buffer);
  const html = decoded.html;
  const $ = cheerio.load(html);

  const result = [];
  const seen = new Set();
  const sampleRows = [];

  const tables = $("table").filter((_, table) => {
    const text = normalizeText($(table).text());
    return text.includes("氏名") && text.includes("ふりがな") && text.includes("会派");
  });

  const rowSource = tables.length ? tables.find("tr") : $("tr");

  rowSource.each((_, tr) => {
    const cells = collectCells($, tr);
    if (cells.length < 3) return;

    if (sampleRows.length < 12) {
      sampleRows.push(cells.join(" | "));
    }

    let name = "";
    let kana = "";
    let party = "";

    for (const cell of cells) {
      if (!kana && isKanaLike(cell)) kana = cell;
      if (!party && isPartyLike(cell)) party = cell;
    }

    for (const cell of cells) {
      if (isNameLike(cell)) {
        const cleaned = cleanName(cell);
        if (cleaned && cleaned !== kana && cleaned !== party) {
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

  if (result.length < 300) {
    const preview = sampleRows.length ? sampleRows.join("\n") : "(no usable rows)";
    throw new Error(
      `Too few representatives extracted: ${result.length}\n` +
      `Detected encoding: ${decoded.encoding}\n` +
      `Sample rows:\n${preview}`
    );
  }

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, "representatives.json");
  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");

  console.log("representatives:", result.length);
  console.log("encoding:", decoded.encoding);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
