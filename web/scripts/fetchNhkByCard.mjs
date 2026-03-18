import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const START_URL =
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html";

const BASE = "https://news.web.nhk";

const DATA_PATH = path.resolve(
  "public/data/representatives.json"
);

async function main() {
  console.log("nhk-alt-mode start");

  const res = await fetch(START_URL);
  if (!res.ok) {
    throw new Error(`fetch failed: ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];

  $("img").each((_, el) => {
    const src = $(el).attr("src");
    const alt = $(el).attr("alt");

    if (!src || !alt) return;

    const name = alt.replace(/\s+/g, "").trim();
    if (!name) return;

    const image = new URL(src, BASE).toString();

    results.push({ name, image });
  });

  console.log("raw images:", results.length);

  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));

  let matched = 0;

  for (const item of results) {
    const target = members.find((m) => m.name === item.name);
    if (target) {
      target.image = item.image;
      target.imageSource = "nhk";
      matched++;
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(members, null, 2));

  console.log("matched:", matched);
}

main();
