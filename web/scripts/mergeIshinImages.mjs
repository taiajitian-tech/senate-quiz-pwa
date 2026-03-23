import fs from "fs/promises";

const REP_PATH = "./public/data/representatives.json";
const ISHIN_PATH = "./public/data/ishin-images.json";

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
    .replace(/[()（）]/g, "")
    .replace(/衆議院議員/g, "")
    .replace(/前衆議院議員/g, "")
    .replace(/候補者/g, "")
    .replace(/比例代表/g, "")
    .replace(/小選挙区/g, "")
    .replace(/近畿ブロック/g, "")
    .replace(/九州ブロック/g, "")
    .replace(/中国ブロック/g, "")
    .replace(/四国ブロック/g, "")
    .replace(/東海ブロック/g, "")
    .replace(/北陸信越ブロック/g, "")
    .replace(/東北ブロック/g, "")
    .replace(/南関東ブロック/g, "")
    .replace(/北関東ブロック/g, "")
    .replace(/北海道ブロック/g, "")
    .replace(/東京ブロック/g, "")
    .replace(/東京\d+区/g, "")
    .replace(/大阪\d+区/g, "")
    .replace(/兵庫\d+区/g, "")
    .replace(/京都\d+区/g, "")
    .replace(/奈良\d+区/g, "")
    .replace(/滋賀\d+区/g, "")
    .replace(/和歌山\d+区/g, "")
    .replace(/党.*$/g, "")
    .replace(/^\d+$/g, "")
    .trim();
}

function isIshinParty(value) {
  const v = String(value ?? "");
  return v.includes("維新") || v.includes("日本維新の会");
}

function buildImageMap(ishinImages) {
  const imageMap = new Map();
  for (const item of ishinImages) {
    const rawName = String(item?.name ?? "");
    const key = normalizeName(rawName);
    const image = String(item?.image ?? "").trim();
    if (!key || !image) continue;
    if (!imageMap.has(key)) {
      imageMap.set(key, image);
    }
  }
  return imageMap;
}

async function main() {
  const representatives = JSON.parse(await fs.readFile(REP_PATH, "utf-8"));
  const ishinImages = JSON.parse(await fs.readFile(ISHIN_PATH, "utf-8"));

  const imageMap = buildImageMap(ishinImages);

  const ishinReps = representatives.filter((rep) => isIshinParty(rep.party));
  const repKeys = ishinReps.map((rep) => ({
    raw: String(rep.name ?? ""),
    key: normalizeName(rep.name),
    party: rep.party ?? ""
  }));
  const sourceKeys = ishinImages.map((item) => ({
    raw: String(item.name ?? ""),
    key: normalizeName(item.name),
    image: item.image ?? ""
  }));

  let matched = 0;
  let skippedNonIshin = 0;
  let alreadyHadImage = 0;
  let noMatch = 0;
  const noMatchSamples = [];

  for (const rep of representatives) {
    if (!isIshinParty(rep.party)) {
      skippedNonIshin++;
      continue;
    }

    const key = normalizeName(rep.name);
    const image = imageMap.get(key);

    if (!image) {
      noMatch++;
      if (noMatchSamples.length < 20) {
        noMatchSamples.push({
          repName: rep.name ?? "",
          repKey: key
        });
      }
      continue;
    }

    if (rep.image) {
      alreadyHadImage++;
      continue;
    }

    rep.image = image;
    rep.imageStatus = "official";
    rep.imageCandidates = [image];
    matched++;
  }

  await fs.writeFile(REP_PATH, JSON.stringify(representatives, null, 2) + "\n", "utf-8");

  console.log("=== ishin raw sample ===");
  console.log(sourceKeys.slice(0, 10));
  console.log("=== representatives raw sample ===");
  console.log(repKeys.slice(0, 10));
  console.log("=== normalized source keys ===");
  console.log([...imageMap.keys()].slice(0, 20));
  console.log("=== no-match samples ===");
  console.log(noMatchSamples);

  console.log("ishin-source-count=", ishinImages.length);
  console.log("ishin-source-key-count=", imageMap.size);
  console.log("ishin-representatives=", ishinReps.length);
  console.log("matched=", matched);
  console.log("already-had-image=", alreadyHadImage);
  console.log("no-match=", noMatch);
  console.log("skipped-non-ishin=", skippedNonIshin);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
