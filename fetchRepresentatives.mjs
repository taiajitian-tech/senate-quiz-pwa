
import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/1giin.htm";

async function main(){

  const res = await fetch(URL);
  if(!res.ok){
    throw new Error("Fetch failed: " + res.status);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const result = [];

  $("table tr").each((_, tr) => {

    const tds = $(tr).find("td");

    if(tds.length !== 5) return;

    const nameRaw = $(tds[0]).text().trim();

    if(!nameRaw.includes("君")) return;

    const kana = $(tds[1]).text().trim();
    const party = $(tds[2]).text().trim();

    const name = nameRaw.replace("君","").trim();

    result.push({
      name: name,
      kana: kana,
      house: "衆議院",
      party: party,
      role: "",
      image: ""
    });

  });

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });

  const outFile = path.join(outDir, "representatives.json");

  fs.writeFileSync(outFile, JSON.stringify(result, null, 2), "utf8");

  console.log("representatives:", result.length);
}

main();
