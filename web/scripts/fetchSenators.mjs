import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  出力先（重要）
  GitHub Pages が読む場所：
  web/public/data/senators.json
*/
const OUTPUT_PATH = path.resolve(
  __dirname,
  "../public/data/senators.json"
);

/*
  現職参議院議員一覧ページ
  ※構造変更に耐えるため一覧ページから取得
*/
const LIST_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/ichiran.htm";

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0",
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }

  return await res.text();
}

function extractNames(html) {
  const names = [];

  // 日本語氏名パターン（2〜4文字姓 + 名）
  const regex = /<a[^>]*>([^<]{2,10})<\/a>/g;

  let match;
  while ((match = regex.exec(html)) !== null) {
    const name = match[1].trim();

    // 不要文字除外
    if (
      name.includes("参議院") ||
      name.includes("議員") ||
      name.length < 2
    )
      continue;

    names.push(name);
  }

  // 重複除去
  return [...new Set(names)];
}

function buildData(names) {
  return names.map((name, i) => ({
    id: i + 1,
    name,
    images: [
      // 仮画像（後で差替可）
      `https://source.unsplash.com/400x400/?portrait,face&sig=${i}`,
    ],
  }));
}

async function main() {
  console.log("Fetching list...");

  const html = await fetchHTML(LIST_URL);

  const names = extractNames(html);

  console.log(`Found names: ${names.length}`);

  const data = buildData(names);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify(data, null, 2),
    "utf-8"
  );

  console.log(`Generated: ${data.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
