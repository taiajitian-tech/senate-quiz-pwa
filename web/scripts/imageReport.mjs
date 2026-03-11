import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve("public/data/representatives.json");
const outDir = path.resolve("public/data");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));

const missing = data
  .filter((item) => !String(item.image || "").trim())
  .map((item) => ({
    name: item.name,
    party: item.party || item.role || "",
    profileUrl: item.profileUrl || "",
    imageSource: item.imageSource || "",
    aiGuess: Boolean(item.aiGuess)
  }));

const review = data
  .filter((item) => Boolean(item.aiGuess) || !String(item.image || "").trim())
  .map((item) => ({
    name: item.name,
    party: item.party || item.role || "",
    image: item.image || "",
    imageSource: item.imageSource || "",
    imageSourceUrl: item.imageSourceUrl || "",
    profileUrl: item.profileUrl || "",
    aiGuess: Boolean(item.aiGuess)
  }));

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "missing-images.json"), `${JSON.stringify(missing, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");

console.log(`missing: ${missing.length}`);
console.log(`review: ${review.length}`);
