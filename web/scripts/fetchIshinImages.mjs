import fs from "fs/promises";

const URL = "https://o-ishin.jp/member/shugiin/";

async function main() {
  const res = await fetch(URL);
  const html = await res.text();

  const imgs = [...html.matchAll(/<img[^>]+src="([^"]+)"/g)];

  const results = imgs
    .map(m => m[1])
    .filter(src => src.includes("/wp-content/"))
    .map(src => ({
      image: src.startsWith("http") ? src : "https://o-ishin.jp" + src
    }));

  console.log("img-count=", results.length);
  console.log(results.slice(0, 10));

  await fs.writeFile(
    "./public/data/ishin-images_raw.json",
    JSON.stringify(results, null, 2),
    "utf-8"
  );
}

main();
