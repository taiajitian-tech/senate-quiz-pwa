import fs from "fs/promises";

const REP_PATH = "./public/data/representatives.json";

function isWikipediaImage(url) {
  const v = String(url ?? "").toLowerCase();
  return (
    v.includes("upload.wikimedia.org/") ||
    v.includes("wikipedia.org/") ||
    v.includes("wikimedia.org/")
  );
}

async function main() {
  const representatives = JSON.parse(await fs.readFile(REP_PATH, "utf-8"));

  let clearedCurrentImage = 0;
  let removedCandidateUrls = 0;
  let markedMissing = 0;
  const changedNames = [];

  for (const rep of representatives) {
    let changed = false;

    const currentImage = String(rep.image ?? "").trim();
    const currentStatus = String(rep.imageStatus ?? "").trim();

    if (currentImage && isWikipediaImage(currentImage)) {
      rep.image = "";
      clearedCurrentImage++;
      changed = true;
    }

    if (Array.isArray(rep.imageCandidates)) {
      const before = rep.imageCandidates.length;
      rep.imageCandidates = rep.imageCandidates.filter((url) => !isWikipediaImage(url));
      removedCandidateUrls += before - rep.imageCandidates.length;
      if (before !== rep.imageCandidates.length) {
        changed = true;
      }
    }

    const hasImage = String(rep.image ?? "").trim() !== "";
    const hasCandidates = Array.isArray(rep.imageCandidates) && rep.imageCandidates.length > 0;

    if (!hasImage) {
      rep.imageStatus = hasCandidates ? "review" : "missing";
      if (currentStatus !== rep.imageStatus) {
        changed = true;
      }
      if (rep.imageStatus === "missing") {
        markedMissing++;
      }
    }

    if (changed) {
      changedNames.push(rep.name ?? "");
    }
  }

  await fs.writeFile(REP_PATH, JSON.stringify(representatives, null, 2) + "\n", "utf-8");

  console.log("cleared-current-image=", clearedCurrentImage);
  console.log("removed-candidate-urls=", removedCandidateUrls);
  console.log("changed-records=", changedNames.length);
  console.log("marked-missing=", markedMissing);
  console.log("changed-names-sample=", changedNames.slice(0, 30));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
