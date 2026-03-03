import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

// UA を固定（ブロック回避の保険）
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

// current/ が「中継HTML」になった場合、HTML内の実体URLを拾って追従
function resolveRealListUrl(entryHtml, entryUrl, finalUrl) {
  // まずは res.url（HTTPリダイレクト）を優先
  if (finalUrl && finalUrl !== entryUrl) return finalUrl;

  // 中継HTMLから実体URLを抽出（/giin/221/giin.htm のようなもの）
  const m =
    entryHtml.match(/\/japanese\/joho1\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/\/kousei\/giin\/\d+\/giin\.htm/i);

  if (m?.[0]) return absUrl(entryUrl, m[0]);

  return entryUrl;
}

function extractProfileLinks(listHtml, listUrl) {
  const $ = cheerio.load(listHtml);
  const set = new Set();

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/profile\/\d+\.htm/i.test(href)) return;
    const u = absUrl(listUrl, href);
    if (!u) return;
    if (!u.startsWith("https://www.sangiin.go.jp/")) return;
    set.add(u.replace(/\?.*$/, ""));
  });

  return Array.from(set);
}

function normText(s) {
  return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? m[1] : "";
}

// DOMスキャン：ラベル（会派/所属会派 など）を探し、隣接要素の値を取る
function scanByLabel($, labelVariants) {
  const labels = Array.isArray(labelVariants) ? labelVariants : [labelVariants];

  // 1) th/td
  for (const label of labels) {
    const th = $(`th:contains("${label}")`).first();
    if (th.length) {
      const td = th.next("td");
      const v = normText(td.text());
      if (v) return v;
    }
  }

  // 2) dt/dd
  for (const label of labels) {
    const dt = $(`dt:contains("${label}")`).first();
    if (dt.length) {
      const dd = dt.next("dd");
      const v = normText(dd.text());
      if (v) return v;
    }
  }

  // 3) テキスト「label：value」型（最後の保険）
  const body = normText($("body").text());
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[：:]\\s*([^\\n\\r]{1,80})`);
    const m = body.match(re);
    if (m?.[1]) {
      const v = normText(m[1]);
      if (v) return v;
    }
  }

  return "";
}

function looksLikeGroup(v) {
  const s = normText(v);
  if (!s) return false;
  // 県名等の短語を弾く（党/会/無所属等が無い短語は不採用）
  if (s.length <= 4 && !/(党|会|無所属|クラブ)/.test(s)) return false;
  return true;
}

function extractName($) {
  // h1 を優先
  const h1 = normText($("h1").first().text());
  if (h1) return h1;

  // title から推定（最終保険）
  const t = normText($("title").text());
  if (t) return t.replace(/｜.*$/g, "").replace(/:\s*参議院.*$/g, "").trim();

  return "";
}

function extractGroup($) {
  const v = scanByLabel($, ["所属会派", "会派"]);
  if (looksLikeGroup(v)) return v;
  return "";
}

function extractPhoto(profileUrl, id, $) {
  // 1) 仕様が安定している既知パス（g{ID}.jpg）を最優先
  if (id) {
    return `https://www.sangiin.go.jp/japanese/joho1/kousei/giin/photo/g${id}.jpg`;
  }

  // 2) og:image
  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    const u = absUrl(profileUrl, og);
    if (u) return u;
  }

  // 3) img の jpg
  const img = $("img[src$='.jpg'], img[src$='.JPG']").first().attr("src");
  if (img) {
    const u = absUrl(profileUrl, img);
    if (u) return u;
  }

  return "";
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  // 入口
  const entry = await fetchText(ENTRY_URL);
  let listUrl = resolveRealListUrl(entry.html, ENTRY_URL, entry.finalUrl);

  // current が中継HTMLのままなら、実体URLをもう一度拾って再fetchする
  // （entry.html が極端に短い/ profileリンクが0の場合）
  let listHtml = entry.html;

  // 実体URLと判断できるのに HTML が entry のままの可能性があるので再取得
  if (listUrl !== ENTRY_URL) {
    const real = await fetchText(listUrl);
    listHtml = real.html;
    listUrl = real.finalUrl || listUrl;
  }

  const links = extractProfileLinks(listHtml, listUrl);
  console.log("profile links extracted:", links.length);
  if (!links.length) {
    // 0件でもファイルは更新（監視しやすくする）
    fs.writeFileSync(OUTPUT_PATH, "[]\n", "utf-8");
    console.error("Error: profile link list is empty (0).");
    process.exit(0);
  }

  const senators = [];
  for (const profileUrl of links) {
    try {
      const { html } = await fetchText(profileUrl);
      const $ = cheerio.load(html);

      const idStr = extractIdFromProfileUrl(profileUrl);
      const id = idStr ? Number(idStr) : NaN;

      const name = extractName($);
      if (!name || !Number.isFinite(id)) {
        // 最低限のキーが無ければ捨てる
        console.log("SKIP:", profileUrl, "(missing id/name)");
        continue;
      }

      const group = extractGroup($);
      const photoUrl = extractPhoto(profileUrl, idStr, $);

      senators.push({
        id,
        name,
        group,
        images: photoUrl ? [photoUrl] : [],
      });
    } catch (e) {
      console.log("SKIP:", profileUrl, String(e));
    }
  }

  console.log("parsed senators:", senators.length);

  // 0件でも落とさない（ただし空JSONになる）
  senators.sort((a, b) => a.id - b.id);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(senators, null, 2) + "\n", "utf-8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
