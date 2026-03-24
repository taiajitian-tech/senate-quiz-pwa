import fs from "fs/promises";

const BASE_URL = "https://o-ishin.jp/member/shugiin/";

function makeAbsolute(href) {
  if (!href) return "";
  if (href.startsWith("http://") || href.startsWith("https://")) return href;
  return new globalThis.URL(href, BASE_URL).href;
}

function stripTags(v) {
  return String(v ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const res = await fetch(BASE_URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
      "cache-control": "no-cache"
    }
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText}`);
  }

  const html = await res.text();

  const anchors = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)].map((m) => ({
    href: m[1],
    text: stripTags(m[2]),
    absoluteHref: makeAbsolute(m[1])
  }));

  const images = [...html.matchAll(/<img\b[^>]*>/gi)].map((m) => {
    const tag = m[0];
    return {
      src: (tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? "").trim(),
      dataSrc: (tag.match(/\bdata-src="([^"]+)"/i)?.[1] ?? "").trim(),
      srcset: (tag.match(/\bsrcset="([^"]+)"/i)?.[1] ?? "").trim(),
      dataSrcset: (tag.match(/\bdata-srcset="([^"]+)"/i)?.[1] ?? "").trim(),
      alt: (tag.match(/\balt="([^"]*)"/i)?.[1] ?? "").trim(),
      tag: tag.slice(0, 500)
    };
  });

  const memberImages = images.filter((item) =>
    [item.src, item.dataSrc, item.srcset, item.dataSrcset].some((v) => /\/member\/images\/member\//i.test(v))
  );

  await fs.mkdir("./public/data", { recursive: true });
  await fs.writeFile("./public/data/ishin-page-anchors.json", JSON.stringify(anchors, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-images.json", JSON.stringify(images, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-member-images.json", JSON.stringify(memberImages, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-html.txt", html, "utf-8");

  console.log("anchor-count=", anchors.length);
  console.log("img-tag-count=", images.length);
  console.log("member-image-tag-count=", memberImages.length);
  console.log("sample-member-images=", memberImages.slice(0, 10));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
