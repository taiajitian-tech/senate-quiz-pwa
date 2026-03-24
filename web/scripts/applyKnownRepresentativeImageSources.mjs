import fs from "node:fs/promises";

const REP_PATH = "./public/data/representatives.json";
const SOURCE_PAGES_PATH = "./scripts/representativeImageSourcePages.json";

function normalizeName(value) {
  return String(value || "").normalize("NFKC").replace(/\s+/g, "").replace(/[　]/g, "").trim();
}

async function main() {
  const representatives = JSON.parse(await fs.readFile(REP_PATH, "utf8"));
  const sourcePages = JSON.parse(await fs.readFile(SOURCE_PAGES_PATH, "utf8"));

  const repMap = new Map(representatives.map((rep) => [normalizeName(rep.name), rep]));
  let updated = 0;
  const updatedNames = [];

  for (const [rawName, source] of Object.entries(sourcePages)) {
    if (rawName.startsWith("_")) continue;
    const rep = repMap.get(normalizeName(rawName));
    if (!rep) continue;

    const directImageUrl = String(source?.directImageUrl || "").trim();
    const directSourceUrl = String(source?.directSourceUrl || "").trim();
    const candidatePageUrls = Array.isArray(source?.candidatePageUrls) ? source.candidatePageUrls.filter(Boolean) : [];

    if (!rep.image && directImageUrl) {
      rep.image = directImageUrl;
      rep.imageStatus = "official";
      rep.imageCandidates = [directImageUrl, ...(Array.isArray(rep.imageCandidates) ? rep.imageCandidates : []).filter((url) => url !== directImageUrl)];
      if (directSourceUrl) rep.imageSourcePage = directSourceUrl;
      updated += 1;
      updatedNames.push(rep.name);
      continue;
    }

    const existingCandidates = Array.isArray(rep.imageCandidates) ? rep.imageCandidates : [];
    const merged = [...existingCandidates];
    for (const url of [directImageUrl, directSourceUrl, ...candidatePageUrls]) {
      if (url && !merged.includes(url)) merged.push(url);
    }
    rep.imageCandidates = merged;
  }

  await fs.writeFile(REP_PATH, `${JSON.stringify(representatives, null, 2)}
`, "utf8");

  console.log(`updated=${updated}`);
  console.log(`updated-names=${JSON.stringify(updatedNames)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
