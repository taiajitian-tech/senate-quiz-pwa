import fs from "fs/promises";

const URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/500n/";

async function main() {

  const res = await fetch(URL);
  const html = await res.text();

  // 現職議員名だけ抽出
  const names = [...html.matchAll(/profile\/\d+\.htm[^>]*>(.*?)</g)]
    .map(m => m[1].replace(/\s/g, ""))
    .filter(Boolean);

  // 画像はネットから3候補生成（公式画像なくてもOK）
  const data = names.map((n, i) => ({
    id: i + 1,
    name: n,
    images: [
      `https://source.unsplash.com/240x240/?portrait,face&sig=${i}`,
      `https://source.unsplash.com/240x240/?person,face&sig=${i + 10}`,
      `https://source.unsplash.com/240x240/?headshot&sig=${i + 20}`,
    ]
  }));

  await fs.mkdir("public/data", { recursive: true });

  await fs.writeFile(
    "public/data/senators.json",
    JSON.stringify(data, null, 2)
  );

  console.log("senators.json 更新完了");
}

main();