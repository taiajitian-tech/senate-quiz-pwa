import fs from "fs/promises";

const REP_PATH = "./public/data/representatives.json";
const ISHIN_PATH = "./public/data/ishin-images.json";

function normalizeName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[　]/g, "")
    .trim();
}

function isIshinParty(value) {
  const v = String(value ?? "");
  return v.includes("維新") || v.includes("日本維新の会");
}

async function main() {
  const representatives = JSON.parse(await fs.readFile(REP_PATH, "utf-8"));
  const ishinImages = JSON.parse(await fs.readFile(ISHIN_PATH, "utf-8"));

  const imageMap = new Map(
    ishinImages
      .filter((item) => item?.name && item?.image)
      .map((item) => [normalizeName(item.name), item.image])
  );

  const targetReps = representatives.filter((rep) => isIshinParty(rep.party));

  let matched = 0;
  let alreadyHadImage = 0;
  let noMatch = 0;
  const noMatchNames = [];

  for (const rep of targetReps) {
    const key = normalizeName(rep.name);
    const image = imageMap.get(key);

    if (!image) {
      noMatch++;
      noMatchNames.push(rep.name);
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

  console.log("ishin-source-count=", ishinImages.length);
  console.log("ishin-representatives=", targetReps.length);
  console.log("matched=", matched);
  console.log("already-had-image=", alreadyHadImage);
  console.log("no-match=", noMatch);
  if (noMatchNames.length) {
    console.log("no-match-names=", noMatchNames);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
