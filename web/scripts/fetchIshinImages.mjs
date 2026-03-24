import fs from "fs/promises";

const BASE_URL = "https://o-ishin.jp/member/shugiin/";

const MEMBER_ORDER = [
  { displayName: "柏倉 ゆうじ", name: "柏倉祐司" },
  { displayName: "阿部 司", name: "阿部司" },
  { displayName: "金村 りゅうな", name: "金村龍那" },
  { displayName: "横田 光弘", name: "横田光弘" },
  { displayName: "わかさ 清史", name: "若狹清史" },
  { displayName: "せき 健一郎", name: "関健一郎" },
  { displayName: "斎藤 アレックス", name: "斎藤アレックス" },
  { displayName: "まえはら 誠司", name: "前原誠司" },
  { displayName: "井上 英孝", name: "井上英孝" },
  { displayName: "高見 りょう", name: "高見亮" },
  { displayName: "東 徹", name: "東徹" },
  { displayName: "ミノベ テルオ", name: "美延映夫" },
  { displayName: "梅村 さとし", name: "梅村聡" },
  { displayName: "西田 薫", name: "西田薫" },
  { displayName: "奥下 たけみつ", name: "奥下剛光" },
  { displayName: "うるま 譲司", name: "うるま譲司" },
  { displayName: "はぎ原 けい", name: "萩原佳" },
  { displayName: "池下 卓", name: "池下卓" },
  { displayName: "中司 宏", name: "中司宏" },
  { displayName: "藤田 文武", name: "藤田文武" },
  { displayName: "岩谷 良平", name: "岩谷良平" },
  { displayName: "あおやぎ 仁士", name: "青柳仁士" },
  { displayName: "うらの 靖人", name: "浦野靖人" },
  { displayName: "黒田 征樹", name: "黒田征樹" },
  { displayName: "馬場 伸幸", name: "馬場伸幸" },
  { displayName: "遠藤 たかし", name: "遠藤敬" },
  { displayName: "いとう 信久", name: "伊東信久" },
  { displayName: "一谷 勇一郎", name: "一谷勇一郎" },
  { displayName: "阿部 けいし", name: "阿部圭史" },
  { displayName: "いちむら 浩一郎", name: "市村浩一郎" },
  { displayName: "三木 けえ", name: "三木圭恵" },
  { displayName: "住吉 ひろき", name: "住吉寛紀" },
  { displayName: "池畑 こうたろう", name: "池畑浩太朗" },
  { displayName: "原山 だいすけ", name: "原山大亮" },
  { displayName: "村上 とものぶ", name: "村上智信" },
  { displayName: "喜多 義典", name: "喜多義典" }
];

function makeAbsolute(url) {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return new globalThis.URL(url, BASE_URL).href;
}

function unique(values) {
  const seen = new Set();
  const out = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

async function main() {
  const res = await fetch(BASE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  const candidates = unique(
    [...html.matchAll(/(?:https?:)?\/\/o-ishin\.jp\/member\/images\/member\/[^"'()\s>]+?\.(?:jpg|jpeg|png|webp)/gi)].map((m) => m[0].startsWith("//") ? `https:${m[0]}` : m[0])
      .concat(
        [...html.matchAll(/["'(]((?:\/member\/images\/member\/)[^"'()\s>]+?\.(?:jpg|jpeg|png|webp))/gi)].map((m) => makeAbsolute(m[1]))
      )
  );

  await fs.mkdir("./public/data", { recursive: true });
  await fs.writeFile(
    "./public/data/ishin-images_raw.json",
    JSON.stringify(candidates, null, 2) + "\n",
    "utf-8"
  );

  if (candidates.length < MEMBER_ORDER.length) {
    console.log("raw-image-count=", candidates.length);
    console.log("expected-member-count=", MEMBER_ORDER.length);
    console.log("sample-raw-images=", candidates.slice(0, 10));
    throw new Error("維新ページの画像URL数が36件未満です。ishin-images_raw.json を確認してください。");
  }

  const results = MEMBER_ORDER.map((member, index) => ({
    source: "o-ishin",
    displayName: member.displayName,
    name: member.name,
    image: candidates[index]
  }));

  await fs.writeFile(
    "./public/data/ishin-images.json",
    JSON.stringify(results, null, 2) + "\n",
    "utf-8"
  );

  console.log("raw-image-count=", candidates.length);
  console.log("mapped-count=", results.length);
  console.log("sample-mapped=", results.slice(0, 10));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
