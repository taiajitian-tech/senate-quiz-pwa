import fs from "fs/promises";

const URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/00/giin.htm";

async function main() {
  const res = await fetch(URL);
  const html = await res.text();

  // 現職議員名だけ抽出（現在の参院サイト構造用）
  const names = [
    ...html.matchAll(/<td class="seito">[\s\S]*?<a[^>]*>(.*?)<\/a>/g),
  ]
    .map((m) => m[1].replace(/\s/g, ""))
    .filter(Boolean);

  // 画像はネットから仮生成（2〜3枚）
  const data = names.map((n, i) => ({
    id: i + 1,
    name: n,
    images: [
      `https://source.unsplash.com/480x480/?portrait,face&sig=${i}`,
      `https://source.unsplash.com/480x480/?person,face&sig=${i + 100}`,
      `https://source.unsplash.com/480x480/?headshot&sig=${i + 200}`,
    ],
  }));

  await fs.writeFile(
    "web/public/data/senators.json",
    JSON.stringify(data, null, 2),
    "utf-8"
  );

  console.log("senators.json updated:", data.length);
}

main();
