import fs from "fs";
import { load } from "cheerio";

const URL =
  "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

function normalizeText(s) {
  return (s ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function cleanName(s) {
  return normalizeText(s).replace(/\s+/g, "").replace(/君$/u, "");
}

function cleanKana(s) {
  return normalizeText(s).replace(/\s+/g, "");
}

function looksLikeKana(s) {
  const v = normalizeText(s).replace(/\s+/g, "");
  return /^[ぁ-んーゔゞゝ゜]+$/u.test(v);
}

async function main() {
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const buffer = await res.arrayBuffer();
  const html = new TextDecoder("shift_jis").decode(buffer);
  const $ = load(html);

  const result = [];

  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td")
      .map((__, td) => normalizeText($(td).text()))
      .get();

    // 議員一覧の本行だけ採用
    if (cells.length !== 5) return;

    const [rawName, rawKana, rawParty] = cells;

    // ヘッダ行除外
    if (rawName === "氏名" && rawKana === "ふりがな") return;

    // ふりがな列を基準に議員行判定
    if (!looksLikeKana(rawKana)) return;

    const name = cleanName(rawName);
    const kana = cleanKana(rawKana);
    const party = normalizeText(rawParty);

    if (!name || !kana || !party) return;

    result.push({
      name,
      kana,
      house: "衆議院",
      party,
    });
  });

  const deduped = Array.from(
    new Map(result.map((x) => [x.name, x])).values()
  );

  console.log("representatives:", deduped.length);

  if (deduped.length < 400) {
    throw new Error("Too few representatives extracted");
  }

  fs.mkdirSync("web/public/data", { recursive: true });
  fs.writeFileSync(
    "web/public/data/representatives.json",
    JSON.stringify(deduped, null, 2),
    "utf8"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
