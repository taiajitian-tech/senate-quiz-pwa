import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LIST_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/ichiran.htm";

const OUT_PATH = path.resolve(
  __dirname,
  "..",
  "public",
  "data",
  "senators.json"
);

function normalize(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function abs(u, base) {
  try {
    return new URL(u, base).toString();
  } catch {
    return "";
  }
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "senate-quiz-pwa-bot" },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }

  return {
    html: await res.text(),
    finalUrl: res.url,
  };
}

function extractProfiles(html, baseUrl) {
  const $ = cheerio.load(html);
  const list = [];

  $("a").each((_, a) => {
    const href = $(a).attr("href") ?? "";
    if (!href.includes("/profile/")) return;

    const name = normalize($(a).text()).replace(/\s/g, "");
    if (!name) return;

    list.push({
      name,
      profileUrl: abs(href, baseUrl),
    });
  });

  const uniq = new Map();
  for (const p of list) {
    if (!uniq.has(p.name)) uniq.set(p.name, p);
  }

  return [...uniq.values()];
}

function parseProfile(html, url) {
  const $ = cheerio.load(html);

  const name =
    normalize($("h1").first().text()).replace(/\s/g, "") ||
    normalize($("title").text()).split("｜")[0];

  let img =
    $("img[alt*='顔']").attr("src") ||
    $("#contents img").first().attr("src") ||
    "";

  img = abs(img, url);

  return { name, img };
}

async function main() {
  console.log("Fetching list...");

  const { html, finalUrl } = await fetchHtml(LIST_URL);
  const profiles = extractProfiles(html, finalUrl);

  console.log("Profiles:", profiles.length);

  if (profiles.length < 100) {
    throw new Error("List parsing failed (structure changed)");
  }

  const result = [];

  for (let i = 0; i < profiles.length; i++) {
    const p = profiles[i];

    try {
      const { html } = await fetchHtml(p.profileUrl);
      const parsed = parseProfile(html, p.profileUrl);

      result.push({
        id: i + 1,
        name: parsed.name || p.name,
        images: parsed.img ? [parsed.img] : [],
        source: p.profileUrl,
      });

      console.log("OK:", parsed.name);
    } catch {
      console.log("skip:", p.profileUrl);
    }
  }

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });

  await fs.writeFile(
    OUT_PATH,
    JSON.stringify(result, null, 2),
    "utf-8"
  );

  console.log("Generated:", result.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
