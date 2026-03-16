import fs from "node:fs";
import path from "node:path";

const dataPath = path.resolve("public/data/representatives.json");
const outDir = path.resolve("public/data");
const sourcePagesPath = path.resolve("scripts/representativeImageSourcePages.json");

const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const sourcePages = fs.existsSync(sourcePagesPath) ? JSON.parse(fs.readFileSync(sourcePagesPath, "utf8")) : {};

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function inferReason(item) {
  const image = String(item.image || "").toLowerCase();
  const source = String(item.imageSource || "").toLowerCase();
  const sourceUrl = String(item.imageSourceUrl || "").toLowerCase();
  if (!normalizeText(item.image)) return "no_image";
  if (/diet|kokkai|building|議事堂|parliament|国会議事堂/.test(`${image} ${sourceUrl}`)) return "building_image";
  if (/poster|flyer|leaflet|manifesto|選挙公報|senkyo/.test(`${image} ${sourceUrl}`)) return "poster_image";
  if (/youtube|facebook|x\.com|twitter|instagram/.test(`${image} ${sourceUrl}`)) return "sns_or_video_thumbnail";
  if (item.aiGuess) return "estimated_candidate";
  if (/manual-source-page/.test(source)) return "manual_source_page";
  if (/trusted-fallback/.test(source)) return "trusted_fallback_review";
  if (/web-fallback/.test(source)) return "needs_manual_check";
  if (/wikipedia/.test(source) && /geta_zoutei|集合|group|speech|街頭|演説/.test(`${image} ${sourceUrl}`)) return "face_too_far";
  return "manual_review";
}

function buildSearchHints(item) {
  return [item.house || "衆議院", item.party || "", "議員", item.name, "プロフィール", "顔写真"].filter(Boolean);
}

function makeBaseRecord(item, status) {
  const manual = sourcePages[item.name] || {};
  return {
    name: item.name,
    party: item.party || item.role || "",
    status,
    reason: inferReason(item),
    profileUrl: item.profileUrl || "",
    currentImage: item.image || "",
    imageSource: item.imageSource || "",
    imageSourceUrl: item.imageSourceUrl || "",
    aiGuess: Boolean(item.aiGuess),
    preferredSourceType: manual.preferredSourceType || "official_or_party",
    searchHints: Array.isArray(manual.searchHints) && manual.searchHints.length ? manual.searchHints : buildSearchHints(item),
    checkedSources: Array.isArray(manual.checkedSources) ? manual.checkedSources : [],
    candidatePageUrls: Array.isArray(manual.candidatePageUrls) ? manual.candidatePageUrls : [],
    notes: manual.notes || ""
  };
}

const missing = data
  .filter((item) => !normalizeText(item.image))
  .map((item) => makeBaseRecord(item, "missing"));

const review = data
  .filter((item) => {
    const reason = inferReason(item);
    return reason !== "manual_review" && reason !== "manual_source_page";
  })
  .map((item) => makeBaseRecord(item, !normalizeText(item.image) ? "missing" : "review"));

const fixTargets = review;

function toCsv(rows) {
  const headers = [
    "name",
    "party",
    "status",
    "reason",
    "profileUrl",
    "currentImage",
    "imageSource",
    "imageSourceUrl",
    "preferredSourceType",
    "searchHints",
    "checkedSources",
    "candidatePageUrls",
    "notes"
  ];
  const escape = (value) => {
    const text = Array.isArray(value) ? value.join(" | ") : String(value ?? "");
    const escaped = text.replace(/"/g, '""');
    return `"${escaped}"`;
  };
  return [headers.join(","), ...rows.map((row) => headers.map((h) => escape(row[h])).join(","))].join("\n") + "\n";
}

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "missing-images.json"), `${JSON.stringify(missing, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-review.json"), `${JSON.stringify(review, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-search-targets.json"), `${JSON.stringify(missing, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-search-targets.csv"), toCsv(missing), "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-fix-targets.json"), `${JSON.stringify(fixTargets, null, 2)}\n`, "utf8");
fs.writeFileSync(path.join(outDir, "representatives-image-fix-targets.csv"), toCsv(fixTargets), "utf8");

console.log(`missing: ${missing.length}`);
console.log(`review: ${review.length}`);
console.log(`search-targets: ${missing.length}`);
console.log(`fix-targets: ${fixTargets.length}`);
