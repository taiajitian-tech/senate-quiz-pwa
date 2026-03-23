
import fs from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer";

const dataPath = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();
const CONCURRENCY = Math.max(1, Number(process.env.REP_IMAGE_CONCURRENCY || 4));
const NHK_WAIT_MS = Math.max(300, Number(process.env.REP_IMAGE_NHK_WAIT_MS || 1500));

const NHK_SEED_URLS = [
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html",
  "https://news.web.nhk/senkyo/database/shugiin/00/tousen_toukaku_hirei.html"
];

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return normalizeSpace(String(value))
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/君$/u, "")
    .replace(/[()（）「」『』・･.\-ー]/g, "");
}

function normalizeUrl(url = "", base = "") {
  const raw = String(url || "").trim().replace(/&amp;/g, "&");
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return "";
  try {
    const parsed = new URL(raw, base || undefined);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function getImageUrlFromAttrs(attrs = {}, baseUrl = "") {
  const candidates = [
    attrs.src,
    attrs["data-src"],
    attrs["data-original"],
    attrs["data-lazy-src"],
    attrs["srcset"],
    attrs["data-srcset"],
    attrs["data-lazy-srcset"]
  ];
  for (const candidate of candidates) {
    const raw = String(candidate || "").trim();
    if (!raw) continue;
    const first = raw.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
    const url = normalizeUrl(first, baseUrl);
    if (url) return url;
  }
  return "";
}

function loadFixTargetSet() {
  if (!fs.existsSync(FIX_TARGETS_PATH)) return new Set();
  try {
    const items = JSON.parse(fs.readFileSync(FIX_TARGETS_PATH, "utf8"));
    return new Set((Array.isArray(items) ? items : []).map((item) => cleanName(item?.name || "")));
  } catch {
    return new Set();
  }
}

function shouldProcessMember(member, fixSet) {
  const hasImage = Boolean(normalizeSpace(member?.image || ""));
  if (TARGET_MODE === "all") return true;
  if (TARGET_MODE === "fix") return fixSet.has(cleanName(member?.name || ""));
  return !hasImage;
}

function markResolved(member, found) {
  member.image = found.url;
  member.imageSource = "nhk-winners";
  member.imageSourceUrl = found.sourceUrl || found.url;
  member.aiGuess = false;
  member.sourceType = "verified";
  member.imageMaskBottom = false;
  member.imageMaskMode = "none";
}

async function autoScroll(page) {
  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 6; i += 1) {
      window.scrollTo(0, document.body.scrollHeight);
      await wait(250);
    }
    window.scrollTo(0, 0);
  });
}

async function extractFromPage(page, pageUrl) {
  return await page.evaluate((pageUrl) => {
    const normalizeText = (value = "") => String(value).replace(/\s+/g, " ").trim();
    const getAttrMap = (el) => {
      const out = {};
      for (const attr of Array.from(el.attributes || [])) out[attr.name] = attr.value;
      return out;
    };
    const pickContainer = (img) => {
      let node = img;
      for (let i = 0; i < 6 && node; i += 1) {
        if (node.matches?.("a, li, article, section, tr, .candidate, .item, .list-item, .media, .mediaUnit, .contents")) {
          return node;
        }
        node = node.parentElement;
      }
      return img.closest("div") || img.parentElement || img;
    };

    const imgEntries = Array.from(document.querySelectorAll("img")).map((img) => {
      const attrs = getAttrMap(img);
      const container = pickContainer(img);
      const text = normalizeText(container?.textContent || "");
      return {
        attrs,
        text,
        pageUrl,
        width: Number(img.naturalWidth || img.width || 0),
        height: Number(img.naturalHeight || img.height || 0),
        alt: normalizeText(img.getAttribute("alt") || "")
      };
    });

    const links = Array.from(document.querySelectorAll('a[href]')).map((a) => a.href).filter(Boolean);
    return { imgEntries, links, title: document.title || "" };
  }, pageUrl);
}

async function crawlNhkCards(targetNames) {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    defaultViewport: { width: 1440, height: 2400 }
  });

  const visited = new Set();
  const queue = [...NHK_SEED_URLS];
  const cards = [];
  const sameSite = (url) => /^https:\/\/news\.web\.nhk\/senkyo\/database\/shugiin\//i.test(url);

  try {
    const page = await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36");

    while (queue.length > 0) {
      const url = queue.shift();
      const normalized = normalizeUrl(url);
      if (!normalized || visited.has(normalized) || !sameSite(normalized)) continue;
      visited.add(normalized);

      try {
        await page.goto(normalized, { waitUntil: "domcontentloaded", timeout: 60000 });
        await page.waitForTimeout(NHK_WAIT_MS);
        await autoScroll(page);
        await page.waitForTimeout(500);

        const { imgEntries, links, title } = await extractFromPage(page, normalized);
        console.log(`nhk-cache: page=${normalized} imgs=${imgEntries.length}`);

        for (const raw of links) {
          const next = normalizeUrl(raw, normalized);
          if (!next || visited.has(next) || !sameSite(next)) continue;
          if (/\/(00|01|02|03|04|05|06|07|08|09|10)\//.test(next) || /\.html$/i.test(next)) {
            queue.push(next);
          }
        }

        for (const item of imgEntries) {
          const imageUrl = getImageUrlFromAttrs(item.attrs, normalized);
          if (!imageUrl) continue;
          const hay = cleanName(`${item.text} ${item.alt} ${title}`);
          if (!hay) continue;
          if (!/(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(imageUrl)) continue;
          if (/logo|icon|banner|button|btn|sns|share|header|footer|favorite|お気に入り/i.test(imageUrl + " " + item.alt + " " + item.text)) continue;

          const matches = targetNames.filter((name) => hay.includes(name.clean));
          if (matches.length !== 1) continue;

          cards.push({
            name: matches[0].raw,
            clean: matches[0].clean,
            url: imageUrl,
            sourceUrl: normalized,
            width: item.width,
            height: item.height,
            text: item.text
          });
        }
      } catch (error) {
        console.log(`nhk-cache: fetch-failed url=${normalized} reason=${error?.message || "unknown"}`);
      }
    }

    return { visitedPages: visited.size, cards };
  } finally {
    await browser.close().catch(() => {});
  }
}

function chooseBestCards(cards) {
  const byName = new Map();
  for (const card of cards) {
    const score =
      (card.width >= 160 ? 10 : 0) +
      (card.height >= 160 ? 10 : 0) +
      (/比例|小選挙区|当選|当確|自民|維新|国民|共産|参政|みらい|中道/u.test(card.text) ? 3 : 0) +
      (card.sourceUrl.includes("/senkyo/database/shugiin/") ? 2 : 0);

    const current = byName.get(card.clean);
    if (!current || score > current.score) {
      byName.set(card.clean, { ...card, score });
    }
  }
  return byName;
}

async function main() {
  const members = JSON.parse(fs.readFileSync(dataPath, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetNames = targets.map((member) => ({ raw: member.name, clean: cleanName(member.name) })).filter((x) => x.clean);

  console.log(`nhk-fetch:v1 mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);

  if (!targets.length) {
    console.log("nhk-fetch:v1 nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhkCards(targetNames);
  console.log(`nhk-cache: visited-pages=${visitedPages}`);
  console.log(`nhk-cache: raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    throw new Error(`NHK scrape failed: visitedPages=${visitedPages} cards=${cards.length}`);
  }

  const bestByName = chooseBestCards(cards);
  console.log(`nhk-cache: matched-members=${bestByName.size}`);

  let filled = 0;
  let stillMissing = 0;
  for (const member of targets) {
    const found = bestByName.get(cleanName(member.name));
    if (found?.url) {
      markResolved(member, found);
      filled += 1;
      console.log(`filled: ${member.name} -> nhk-winners`);
    } else {
      stillMissing += 1;
      console.log(`missing: ${member.name}`);
    }
  }

  fs.writeFileSync(dataPath, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`nhk-fetch:v1 complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
