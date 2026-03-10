import fs from "fs";
import { load } from "cheerio";

const URL =
"https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

const PARTY_LIST = [
  "自民",
  "立民",
  "維新",
  "公明",
  "共産",
  "国民",
  "れ新",
  "参政",
  "社民",
  "無"
];

async function main() {
  const res = await fetch(URL);
  const buffer = await res.arrayBuffer();
  const html = new TextDecoder("shift_jis").decode(buffer);

  const $ = load(html);
  const result = [];

  $("tr").each((_, tr) => {
    const tds = $(tr).children("td, th");
    if (tds.length < 3) return;

    const cells = tds
      .map((__, td) => $(td).text().replace(/\s+/g, " ").trim())
      .get()
      .filter(Boolean);

    if (cells.length < 3) return;

    const kanaIndex = cells.findIndex((v) => /^[ぁ-んー\s]+$/.test(v));
    if (kanaIndex <= 0) return;

    const rawName = cells[kanaIndex - 1] ?? "";
    const rawKana = cells[kanaIndex] ?? "";
    const rawParty = cells.slice(kanaIndex + 1).find((v) =>
      PARTY_LIST.some((p) => v.includes(p))
    ) ?? "";

    const name = rawName.replace(/\s+/g, "").replace(/君$/u, "");
    const kana = rawKana.replace(/\s+/g, "");
    let party = PARTY_LIST.find((p) => rawParty.includes(p)) ?? rawParty.trim();

    if (!name || !kana || !party) return;
    if (!/[一-龠々ヶヵぁ-んァ-ヴ]/u.test(name)) return;

    result.push({
      name,
      kana,
      house: "衆議院",
      party
    });
  });

  const deduped = Array.from(
    new Map(result.map((item) => [item.name, item])).values()
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
