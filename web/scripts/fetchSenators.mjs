import fs from "fs/promises";

const URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/500n/";

async function main() {
  const res = await fetch(URL);
  const html = await res.text();

  // 現職議員名だけ抽出
  const names = [...html.matchAll(/profile\/\d+\.htm[^>]*>(.*?)<\/a>/g)]
    .map(m => m[1].replace(/\s/g, ""))
    .filter(Boolean);

  // 画像は仮生成
  const data = names.map((n, i) => ({
    id: i + 1,
    name: n,
    images: [
      `https://source.unsplash.com/480x480/?portrait,face&sig=${i}`,
      `https://source.unsplash.com/480x480/?person,face&sig=${i + 100}`,
      `https://source.unsplash.com/480x480/?headshot&sig=${i + 200}`
    ]
  }));

  await fs.writeFile(
    "web/public/data/senators.json",
    JSON.stringify(data, null, 2)
  );

  console.log("senators.json 更新完了");
  console.log("取得人数:", data.length);
}

main();
