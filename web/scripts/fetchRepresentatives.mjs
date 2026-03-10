
import fs from "fs";
import path from "path";
import cheerio from "cheerio";

const BASE = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/";

// 固定巡回ページ（無限ループ防止）
const pages = [
  "agiin.htm",
  "kagiin.htm",
  "sagiin.htm",
  "tagiin.htm",
  "nagiin.htm",
  "hagiin.htm",
  "magiin.htm",
  "yagiin.htm",
  "ragiin.htm",
  "wagiin.htm"
];

const result = [];
const visited = new Set();

async function fetchWithTimeout(url, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);

  const res = await fetch(url, { signal: controller.signal });
  clearTimeout(id);

  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.text();
}

function extractKana(name) {
  return name.replace(/[^ぁ-んー]/g, "");
}

async function run() {

  for (const page of pages) {

    const url = BASE + page;

    if (visited.has(url)) continue;
    visited.add(url);

    try {

      console.log("fetch:", url);

      const html = await fetchWithTimeout(url);
      const $ = cheerio.load(html);

      $("a").each((_, el) => {

        const name = $(el).text().trim();

        if (!name) return;

        if (name.length > 20) return;

        const item = {
          name: name,
          kana: extractKana(name),
          house: "衆議院",
          party: "",
          role: "",
          image: ""
        };

        result.push(item);

      });

      if (result.length > 500) break;

    } catch (e) {

      console.log("skip:", url);

    }

  }

  const outDir = path.resolve("web/public/data");
  fs.mkdirSync(outDir, { recursive: true });

  const outPath = path.join(outDir, "representatives.json");

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf8");

  console.log("saved:", result.length);

}

run();
