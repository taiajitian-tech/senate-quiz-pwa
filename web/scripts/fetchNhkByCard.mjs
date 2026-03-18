import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const BASE = "https://news.web.nhk";

const DATA_PATH = path.resolve("public/data/representatives.json");

async function main() {
  console.log("nhk-multipage start");

  const results = [];

  for (let i = 0; i < 20; i++) {
    const page = String(i).padStart(2, "0");
    const url = `https://news.web.nhk/senkyo/database/shugiin/${page}/tousen_toukaku_senkyoku.html`;

    try {
      const res = await fetch(url);
      if (!res.ok) continue;

      const html = await res.text();
      const $ = cheerio.load(html);

      $("img").each((_, el) => {
        const src = $(el).attr("src");
        const alt = $(el).attr("alt");

        if (!src || !alt) return;

        const name = alt.replace(/\s+/g, "").trim();
        if (!name) return;

        const image = new URL(src, BASE).toString();

        results.push({ name, image });
      });

      console.log("page", page, "done");
    } catch {
      continue;
    }
  }

  console.log("total images:", results.length);

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
