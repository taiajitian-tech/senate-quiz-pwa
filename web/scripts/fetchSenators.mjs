import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * 参議院公式サイト「議員一覧（50音順）」から現職データを取得します。
 * 取得元（公式）：https://www.sangiin.go.jp/
 */
const LIST_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

// 出力先（GitHub Pages で配信される静的JSON）
const OUT_PATH = path.resolve(__dirname, "..", "public", "data", "senators.json");

// 会派（正式表記）→ 略称（UI表示用）
const GROUP_ABBR = [
  [/自由民主党/, "自民"],
  [/立憲民主党/, "立憲"],
  [/公明党/, "公明"],
  [/日本維新の会/, "維新"],
  [/国民民主党/, "国民"],
  [/日本共産党/, "共産"],
  [/れいわ新選組/, "れいわ"],
  [/社会民主党/, "社民"],
  [/参政党/, "参政"],
  [/NHK党|ＮＨＫ党|NHKから国民を守る党/, "NHK"],
  [/無所属/, "無所属"],
];

function normalizeText(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function toGroupAbbr(raw) {
  const s = normalizeText(raw);
  if (!s) return "";
  for (const [re, abbr] of GROUP_ABBR) {
    if (re.test(s)) return abbr;
  }
  // 想定外の表記は短くして返す（暴れ防止）
  return s.length > 12 ? s.slice(0, 12) : s;
}

function absUrl(u, base) {
  if (!u) return "";
  try {
    return new URL(u, base).toString();
  } catch {
    return u;
  }
}

// 併走数を抑えた簡易コンカレンシー
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < items.length) {
      const my = i++;
      results[my] = await fn(items[my], my);
    }
  });
  await Promise.all(workers);
  return results;
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; senate-quiz-pwa/1.0; +https://github.com/taiajitian-tech/senate-quiz-pwa)",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText} (${url})`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

function extractProfileLinks(listHtml, listFinalUrl) {
  const $ = cheerio.load(listHtml);
  const raw = [];

  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    // profile/7007006.htm のようなリンクが正。
    if (!/\/profile\/\d+\.htm/i.test(href) && !/profile\/\d+\.htm/i.test(href)) return;

    const name = normalizeText($(a).text()).replace(/\s/g, "");
    if (!name) return;

    const profileUrl = absUrl(href, listFinalUrl);
    raw.push({ name, profileUrl });
  });

  // 同名は最初を採用（重複除去）
  const uniq = new Map();
  for (const r of raw) {
    if (!uniq.has(r.name)) uniq.set(r.name, r);
  }
  return Array.from(uniq.values());
}

function parseProfilePage(profileHtml, profileUrl) {
  const $ = cheerio.load(profileHtml);

  // 名前
  const name =
    normalizeText($("h1").first().text()).replace(/\s/g, "") ||
    normalizeText($("title").text()).split("：")[0].replace(/\s/g, "");

  // 会派（「所属会派」の右側/次要素から拾う）
  let groupRaw = "";

  // table(th/td) パターン
  const th = $("th").filter((_, el) => normalizeText($(el).text()) === "所属会派").first();
  if (th.length) groupRaw = normalizeText(th.next("td").text());

  // dl(dt/dd) パターン
  if (!groupRaw) {
    const dt = $("dt").filter((_, el) => normalizeText($(el).text()) === "所属会派").first();
    if (dt.length) groupRaw = normalizeText(dt.next("dd").text());
  }

  // テキストのみページの保険（「所属会派」行の次行）
  if (!groupRaw) {
    const bodyText = $("body").text();
    const m = bodyText.match(/所属会派\s*([\s\S]{0,40})/);
    if (m) groupRaw = normalizeText(m[1]).split(/\r?\n/)[0];
  }

  const group = toGroupAbbr(groupRaw);

  // 顔写真URL
  let imgSrc =
    $("img[alt*='顔写真']").first().attr("src") ||
    $("img[alt*='議員の顔写真']").first().attr("src") ||
    "";

  if (!imgSrc) {
    // なるべく「本文」側の画像に寄せる（ヘッダーロゴ回避）
    imgSrc = $("#contents img").first().attr("src") || $("#main img").first().attr("src") || "";
  }
  if (!imgSrc) {
    // 最終手段
    imgSrc = $("img").last().attr("src") || $("img").first().attr("src") || "";
  }

  const img = imgSrc ? absUrl(imgSrc, profileUrl) : "";

  return { name, group, img };
}

async function fetchAndParseProfile(profileUrl) {
  try {
    const { html } = await fetchHtml(profileUrl);
    return parseProfilePage(html, profileUrl);
  } catch (e) {
    console.error(`[profile] failed: ${profileUrl}`);
    console.error(e);
    return { name: "", group: "", img: "" };
  }
}

async function main() {
  const { html: listHtml, finalUrl: listFinalUrl } = await fetchHtml(LIST_URL);
  const baseList = extractProfileLinks(listHtml, listFinalUrl);

  if (baseList.length < 50) {
    console.warn(`Warning: small list size (${baseList.length}). List page structure may have changed.`);
  }

  const profiles = await mapWithConcurrency(baseList, 6, async (r) => {
    const p = await fetchAndParseProfile(r.profileUrl);
    return {
      profileUrl: r.profileUrl,
      name: p.name || r.name,
      group: p.group || "",
      img: p.img || "",
    };
  });

  const out = profiles
    .filter((p) => p.name)
    .map((p, idx) => ({
      id: idx + 1,
      name: p.name,
      group: p.group,
      images: p.img ? [p.img] : [],
      source: p.profileUrl,
    }));

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");

  console.log(`Generated: ${OUT_PATH}`);
  console.log(`Count: ${out.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
