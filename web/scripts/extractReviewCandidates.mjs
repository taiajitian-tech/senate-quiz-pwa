import fs from "fs/promises";

const REP_PATH = "./public/data/representatives.json";
const OUT_DIR = "./public/data";

function isLikelyBadImage(url) {
  const v = String(url ?? "").toLowerCase();
  if (!v) return true;

  const badPatterns = [
    /noimage/,
    /no-image/,
    /placeholder/,
    /default/,
    /dummy/,
    /blank/,
    /icon/,
    /silhouette/,
    /avatar/,
    /sample/,
    /comingsoon/,
    /nowprinting/,
    /notfound/
  ];

  return badPatterns.some((re) => re.test(v));
}

function scoreImage(url) {
  const v = String(url ?? "").toLowerCase();
  let score = 0;

  if (!v) score += 100;
  if (/o-ishin\.jp\/member\/images\/member\//.test(v)) score -= 20;
  if (/shugiin|sangiin|kantei|go\.jp/.test(v)) score -= 10;
  if (/wikipedia|wikimedia/.test(v)) score += 8;
  if (/thumb|thumbnail|small|icon|crop/.test(v)) score += 8;
  if (isLikelyBadImage(v)) score += 50;

  return score;
}

async function main() {
  const representatives = JSON.parse(await fs.readFile(REP_PATH, "utf-8"));

  const reviewRows = [];
  const missingRows = [];
  const okRows = [];

  for (const rep of representatives) {
    const image = String(rep.image ?? "").trim();
    const candidates = Array.isArray(rep.imageCandidates) ? rep.imageCandidates : [];
    const status = String(rep.imageStatus ?? "").trim();

    const row = {
      name: rep.name ?? "",
      party: rep.party ?? "",
      image,
      imageStatus: status,
      imageScore: scoreImage(image),
      imageCandidatesCount: candidates.length,
      imageCandidates: candidates
    };

    if (!image) {
      missingRows.push(row);
      continue;
    }

    if (status === "review" || row.imageScore >= 10) {
      reviewRows.push(row);
      continue;
    }

    okRows.push(row);
  }

  reviewRows.sort((a, b) => b.imageScore - a.imageScore || a.name.localeCompare(b.name, "ja"));
  missingRows.sort((a, b) => a.name.localeCompare(b.name, "ja"));
  okRows.sort((a, b) => a.name.localeCompare(b.name, "ja"));

  await fs.mkdir(OUT_DIR, { recursive: true });

  await fs.writeFile(
    `${OUT_DIR}/representatives_review_candidates.json`,
    JSON.stringify(reviewRows, null, 2) + "\n",
    "utf-8"
  );

  await fs.writeFile(
    `${OUT_DIR}/representatives_missing_images.json`,
    JSON.stringify(missingRows, null, 2) + "\n",
    "utf-8"
  );

  await fs.writeFile(
    `${OUT_DIR}/representatives_image_quality_summary.json`,
    JSON.stringify(
      {
        total: representatives.length,
        ok: okRows.length,
        review: reviewRows.length,
        missing: missingRows.length
      },
      null,
      2
    ) + "\n",
    "utf-8"
  );

  console.log("total=", representatives.length);
  console.log("ok=", okRows.length);
  console.log("review=", reviewRows.length);
  console.log("missing=", missingRows.length);
  console.log("top-review-samples=", reviewRows.slice(0, 10));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
