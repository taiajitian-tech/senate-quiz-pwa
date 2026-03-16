import fs from "node:fs";
import path from "node:path";

const dataDir = path.resolve("public/data");
const representativesPath = path.join(dataDir, "representatives.json");
const fallbackImage = "assets/no-photo.webp";

const fallbackTargets = new Set([
  "逢沢一郎",
  "浅田眞澄美",
  "東国幹",
  "阿部弘樹",
  "安藤たかお",
  "石坂太",
  "上田英俊",
  "遠藤寛明",
  "川崎ひでと",
  "斉木武志",
  "俵田祐児",
  "辻由布子",
  "東田淳平",
  "藤田誠",
  "古井康介",
  "三原朝利",
  "吉田有理",
  "犬飼明佳",
  "大森江里子",
  "中川宏昌",
  "西村智奈美",
  "沼崎満子",
  "野間健",
  "原田直樹",
  "平林晃",
  "福重隆浩",
  "山崎正恭",
  "早稲田ゆき",
  "渡辺創",
  "青柳仁士",
  "池畑浩太朗",
  "一谷勇一郎",
  "奥下剛光",
  "柏倉祐司",
  "保岡宏武",
  "山田基靖",
  "山口晋",
  "市村浩一郎"
]);

function writeJson(filename, value) {
  fs.writeFileSync(path.join(dataDir, filename), `${JSON.stringify(value, null, 2)}
`, "utf8");
}

function writeCsv(filename) {
  const header = [
    "name","party","status","reason","profileUrl","currentImage","imageSource","imageSourceUrl","preferredSourceType","searchHints","checkedSources","candidatePageUrls","notes"
  ].join(",");
  fs.writeFileSync(path.join(dataDir, filename), `${header}
`, "utf8");
}

const representatives = JSON.parse(fs.readFileSync(representativesPath, "utf8"));
let updated = 0;

for (const item of representatives) {
  if (!fallbackTargets.has(String(item?.name || ""))) continue;
  item.image = fallbackImage;
  item.imageSource = "fallback-manual";
  item.imageSourceUrl = "";
  item.aiGuess = false;
  item.imageMaskBottom = false;
  updated += 1;
}

fs.writeFileSync(representativesPath, `${JSON.stringify(representatives, null, 2)}
`, "utf8");
writeJson("missing-images.json", []);
writeJson("representatives-image-review.json", []);
writeJson("representatives-image-search-targets.json", []);
writeJson("representatives-image-fix-targets.json", []);
writeCsv("representatives-image-search-targets.csv");
writeCsv("representatives-image-fix-targets.csv");

console.log(`representatives fallback updated: ${updated}`);
