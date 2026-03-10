import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

function normalizeText(value) {
  return String(value ?? "")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanName(value) {
  return normalizeText(value).replace(/君$/u, "").trim();
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      "user-agent": "Mozilla/5.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const result = [];
  const seen = new Set();

  const targetTables = $("table").filter((_, table) => {
    const headers = $(table).find("th").map((__, th) => normalizeText($(th).text())).get();
    return headers.includes("氏名") && headers.includes("ふりがな");
  });

  targetTables.each((_, table) => {
    $(table).find("tr").each((__, tr) => {
      const cells = $(tr).find("td");
      if (cells.length < 2) return;

      const rawName = normalizeText($(cells[0]).text());
      const kana = normalizeText($(cells[1]).text());
      const party = normalizeText($(cells[2]).text());

      if (!rawName || !/君$/u.test(rawName)) return;
      if (!kana) return;

      const name = cleanName(rawName);
      if (!name) return;

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
  });

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
