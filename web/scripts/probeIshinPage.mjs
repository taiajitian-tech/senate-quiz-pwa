import fs from "fs/promises";

const URL = "https://o-ishin.jp/member/shugiin/";

function stripTags(value) {
  return String(value ?? "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  const res = await fetch(URL, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8"
    }
  });

  const html = await res.text();

  const anchorMatches = [...html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const imgMatches = [...html.matchAll(/<img\b[^>]*>/gi)];

  const anchors = anchorMatches.map((m) => {
    const href = m[1].trim();
    const text = stripTags(m[2]);
    return {
      href,
      text
    };
  });

  const imgs = imgMatches.map((m) => {
    const tag = m[0];
    const src =
      (tag.match(/\bsrc="([^"]+)"/i)?.[1] ?? "").trim();
    const dataSrc =
      (tag.match(/\bdata-src="([^"]+)"/i)?.[1] ?? "").trim();
    const srcset =
      (tag.match(/\bsrcset="([^"]+)"/i)?.[1] ?? "").trim();
    const dataSrcset =
      (tag.match(/\bdata-srcset="([^"]+)"/i)?.[1] ?? "").trim();
    const alt =
      (tag.match(/\balt="([^"]*)"/i)?.[1] ?? "").trim();

    return {
      src,
      dataSrc,
      srcset,
      dataSrcset,
      alt,
      tag: tag.slice(0, 500)
    };
  });

  const internalAnchors = anchors.filter((a) =>
    a.href &&
    !a.href.startsWith("#") &&
    !a.href.startsWith("mailto:") &&
    !a.href.startsWith("tel:")
  ).map((a) => ({
    ...a,
    absoluteHref: a.href.startsWith("http") ? a.href : new URL(a.href, URL).href
  }));

  const memberLikeAnchors = internalAnchors.filter((a) => {
    const joined = `${a.text} ${a.absoluteHref}`.toLowerCase();
    return (
      /member|giin|profile|politician|representative/.test(joined) ||
      /\/member\//.test(joined) ||
      /\/profile\//.test(joined) ||
      /衆議院|議員|プロフィール/.test(a.text)
    );
  });

  const nonEmptyTexts = anchors
    .filter((a) => a.text)
    .slice(0, 200);

  await fs.mkdir("./public/data", { recursive: true });
  await fs.writeFile("./public/data/ishin-page-anchors.json", JSON.stringify(internalAnchors, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-memberlike-anchors.json", JSON.stringify(memberLikeAnchors, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-images.json", JSON.stringify(imgs, null, 2) + "\n", "utf-8");
  await fs.writeFile("./public/data/ishin-page-html.txt", html, "utf-8");

  console.log("anchor-count=", anchors.length);
  console.log("internal-anchor-count=", internalAnchors.length);
  console.log("memberlike-anchor-count=", memberLikeAnchors.length);
  console.log("img-tag-count=", imgs.length);
  console.log("sample-anchor-texts=", nonEmptyTexts.slice(0, 20));
  console.log("sample-memberlike-anchors=", memberLikeAnchors.slice(0, 20));
  console.log("sample-images=", imgs.slice(0, 20));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
