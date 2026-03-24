import fs from "fs/promises";

const TARGETS = [
  "https://www3.nhk.or.jp/news/special/election/2021/",
  "https://www.yomiuri.co.jp/election/shugiin/",
  "https://o-ishin.jp/member/shugiin/",
];

function absolutize(url, base) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith("//")) return `https:${url}`;
  try {
    return new globalThis.URL(url, base).href;
  } catch {
    return "";
  }
}

function parseSrcset(srcset, base) {
  return String(srcset || "")
    .split(",")
    .map((part) => part.trim().split(/\s+/)[0])
    .map((url) => absolutize(url, base))
    .filter(Boolean);
}

function extractUrls(html, base) {
  const urls = new Set();

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = match[0];
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1] ?? "";
    const dataSrc = tag.match(/\bdata-src=["']([^"']+)["']/i)?.[1] ?? "";
    const srcset = tag.match(/\bsrcset=["']([^"']+)["']/i)?.[1] ?? "";
    const dataSrcset = tag.match(/\bdata-srcset=["']([^"']+)["']/i)?.[1] ?? "";

    [src, dataSrc]
      .map((value) => absolutize(value, base))
      .filter(Boolean)
      .forEach((value) => urls.add(value));

    [...parseSrcset(srcset, base), ...parseSrcset(dataSrcset, base)].forEach((value) => urls.add(value));
  }

  return [...urls];
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache",
    },
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`);
  }

  return await res.text();
}

async function main() {
  const pool = new Set();

  for (const url of TARGETS) {
    try {
      const html = await fetchHtml(url);
      const images = extractUrls(html, url);
      images.forEach((imageUrl) => pool.add(imageUrl));
      console.log("fetched=", url);
      console.log("images=", images.length);
    } catch (error) {
      console.error("fetch-failed=", url);
      console.error(error);
    }
  }

  const result = [...pool];
  await fs.mkdir("./public/data", { recursive: true });
  await fs.writeFile("./public/data/image_pool.json", JSON.stringify(result, null, 2) + "\n", "utf-8");

  console.log("total-image-count=", result.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
