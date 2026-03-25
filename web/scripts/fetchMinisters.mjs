import fs from "fs";
import fetch from "node-fetch";
import * as cheerio from "cheerio";

const URL = "https://www.kantei.go.jp/jp/105/meibo/index.html";

async function main() {
  const res = await fetch(URL);
  const html = await res.text();
  const $ = cheerio.load(html);

  const results = [];

  // ▼ 安定取得：画像と名前セットで全探索
  $("img").each((_, el) => {
    const img = $(el).attr("src");

    if (!img) return;

    const parent = $(el).closest("li, div, section");

    const text = parent.text().trim();

    if (!text) return;

    // 名前っぽい行だけ抽出（簡易）
    const lines = text.split("\n").map(l => l.trim()).filter(Boolean);

    if (lines.length === 0) return;

    const name = lines[0];

    // 明らかに不要なものを除外
    if (
      name.includes("内閣") ||
      name.includes("官邸") ||
      name.length > 20
    ) {
      return;
    }

    results.push({
      id: name,
      name,
      kana: "",
      role: "",
      image: img.startsWith("http")
        ? img
        : "https://www.kantei.go.jp" + img
    });
  });

  // ▼ 重複除去
  const unique = [];
  const seen = new Set();

  for (const r of results) {
    if (!seen.has(r.name)) {
      seen.add(r.name);
      unique.push(r);
    }
  }

  // ▼ フォールバック（空なら既存維持）
  if (unique.length === 0) {
    console.log("⚠ ministers empty → skip overwrite");
    return;
  }

  fs.writeFileSync(
    "public/data/ministers.json",
    JSON.stringify(unique, null, 2),
    "utf-8"
  );

  console.log("ministers:", unique.length);
}

main().catch(err => {
  console.error(err);
  process.exit(0); // ← 落とさない
});