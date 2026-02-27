import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/current.htm";

async function fetchHTML() {
  const res = await fetch(URL);
  if (!res.ok) {
    throw new Error("Failed fetch: " + res.status);
  }
  return await res.text();
}

function parse(html) {
  const $ = cheerio.load(html);

  const senators = [];

  $("table tr").each((_, el) => {
    const tds = $(el).find("td");

    if (tds.length < 2) return;

    const name = $(tds[0]).text().trim();

    // 名前行だけ拾う（余計な行除外）
    if (!name || name.length > 10) return;

    senators.push({
      id: senators.length + 1,
      name,
      image: "",
    });
  });

  return senators;
}

async function main() {
  console.log("Fetching senators...");

  const html = await fetchHTML();
  const data = parse(html);

  console.log("COUNT =", data.length);

  const outPath = path.resolve(
    "public/data/senators.json"
  );

  fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");

  console.log("Written:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
