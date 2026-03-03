// web/scripts/fetchSenators.mjs
// 方針：参議院「現職」ページから profile リンクのみ収集し、各 profile ページをスキャンして情報を確定取得して senators.json を生成する
// 重要：table解析はしない。外部依存（cheerio等）なし。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const OUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function htmlUnescape(s) {
  return (s || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return htmlUnescape(
    (s || "")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?p\b[^>]*>/gi, " ")
      .replace(/<\/?li\b[^>]*>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeSpace(s) {
  return (s || "").replace(/\s+/g, " ").trim();
}

// current/giin.htm が「中継HTML」だった場合、HTML内の実体URL (/kousei/giin/221/giin.htm 等) を拾って追従
function extractRealListUrl(entryHtml, entryUrl) {
  const m =
    entryHtml.match(/\/japanese\/joho1\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/\/kousei\/giin\/\d+\/giin\.htm/i);
  if (!m) return null;
  return absUrl(entryUrl, m[0]);
}

// 一覧HTMLから /profile/xxxx.htm だけ抽出（table構造依存しない）
function extractProfileLinks(listHtml, listUrl) {
  const set = new Set();

  const re = /href\s*=\s*["']([^"']*\/profile\/\d+\.htm(?:\?[^"']*)?)["']/gi;
  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const href = m[1];
    const u = absUrl(listUrl, href);
    if (!u) continue;
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;
    set.add(u.replace(/\?.*$/, ""));
  }

  return Array.from(set);
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? m[1] : "";
}

function extractMetaContent(html, propertyOrName) {
  const re1 = new RegExp(
    `<meta[^>]+property=["']${propertyOrName}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const re2 = new RegExp(
    `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${propertyOrName}["'][^>]*>`,
    "i"
  );
  const m = html.match(re1) || html.match(re2);
  return m?.[1] ? stripTags(m[1]) : "";
}

function extractTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1] ? stripTags(m[1]) : "";
}

function extractH1(html) {
  const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m?.[1] ? stripTags(m[1]) : "";
}

function cleanName(s) {
  const v = normalizeSpace(s)
    .replace(/^参議院議員\s*/g, "")
    .replace(/\s*\|\s*参議院.*$/g, "")
    .replace(/\s*｜\s*参議院.*$/g, "")
    .replace(/\s*\-\s*参議院.*$/g, "")
    .trim();

  if (!v) return "";
  if (/参議院/.test(v) && v.length <= 10) return "";
  return v;
}

function extractName(profileHtml) {
  const og = extractMetaContent(profileHtml, "og:title");
  const h1 = extractH1(profileHtml);
  const title = extractTitle(profileHtml);

  return cleanName(og) || cleanName(h1) || cleanName(title);
}

function extractYomi(profileHtml) {
  const m1 = profileHtml.match(
    /(?:ふりがな|フリガナ|よみ)[\s\S]{0,80}?(?:<td[^>]*>|<dd[^>]*>|：|:)[\s\S]{0,40}?([^<\n\r]{1,40})/i
  );
  return m1?.[1] ? normalizeSpace(stripTags(m1[1])) : "";
}

function looksLikeGroup(s) {
  const v = normalizeSpace(s);
  if (!v) return false;
  if (v.length <= 4 && !/(党|会|無所属|クラブ)/.test(v)) return false;
  return /(党|無所属|会|クラブ|連合|公明|立憲|自民|維新|国民|共産|れいわ|社民)/.test(v);
}

function scanLabeledValue(html, label) {
  const reThTd = new RegExp(
    `<th[^>]*>\\s*${label}\\s*<\\/th>\\s*<td[^>]*>([\\s\\S]*?)<\\/td>`,
    "i"
  );
  const m1 = html.match(reThTd);
  if (m1?.[1]) return stripTags(m1[1]);

  const reDtDd = new RegExp(
    `<dt[^>]*>\\s*${label}\\s*<\\/dt>\\s*<dd[^>]*>([\\s\\S]*?)<\\/dd>`,
    "i"
  );
  const m2 = html.match(reDtDd);
  if (m2?.[1]) return stripTags(m2[1]);

  const text = stripTags(html);
  const reText = new RegExp(`${label}\\s*[：:]\\s*([^\\n\\r]{1,120})`);
  const m3 = text.match(reText);
  if (m3?.[1]) return normalizeSpace(m3[1]);

  return "";
}

function extractGroup(profileHtml) {
  const candidates = [];
  for (const label of ["所属会派", "会派"]) {
    const v = scanLabeledValue(profileHtml, label);
    if (v) candidates.push(v);
  }
  for (const c of candidates) {
    const v = normalizeSpace(c);
    if (looksLikeGroup(v)) return v;
  }
  return "";
}

function extractPhotoUrl(profileHtml, profileUrl) {
  const og = extractMetaContent(profileHtml, "og:image");
  if (og) {
    const u = absUrl(profileUrl, og);
    if (u) return u;
  }

  const mPhoto = profileHtml.match(
    /(\/japanese\/joho1\/kousei\/giin\/photo\/[^"'<>\s]+\.jpg)/i
  );
  if (mPhoto?.[1]) {
    const u = absUrl(profileUrl, mPhoto[1]);
    if (u) return u;
  }

  const re = /<img[^>]+src\s*=\s*["']([^"']+\.jpg)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(profileHtml)) !== null) {
    const u = absUrl(profileUrl, m[1]);
    if (!u) continue;
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;
    return u;
  }

  return "";
}

async function parseProfile(profileUrl) {
  const html = await fetchText(profileUrl);

  const id = extractIdFromProfileUrl(profileUrl);
  const name = extractName(html);
  const yomi = extractYomi(html);
  const group = extractGroup(html);
  const photoUrl = extractPhotoUrl(html, profileUrl);

  return { id, name, yomi, group, profileUrl, photoUrl };
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const entryHtml0 = await fetchText(ENTRY_URL);
  const realListUrl = extractRealListUrl(entryHtml0, ENTRY_URL);
  const listUrl = realListUrl || ENTRY_URL;

  if (realListUrl) console.log("FOLLOW_REAL_LIST_URL:", realListUrl);

  const listHtml = realListUrl ? await fetchText(realListUrl) : entryHtml0;
  console.log("LIST_HTML_LENGTH:", listHtml.length);

  const profileLinks = extractProfileLinks(listHtml, listUrl);
  console.log("profile links extracted:", profileLinks.length);

  if (profileLinks.length === 0) {
    throw new Error("Error: profile link list is empty (0).");
  }

  const CONCURRENCY = 6;
  const results = [];
  let idx = 0;

  async function worker() {
    while (idx < profileLinks.length) {
      const i = idx++;
      const url = profileLinks[i];
      try {
        const obj = await parseProfile(url);

        if (!obj.id || !obj.profileUrl || !obj.name) {
          console.log("SKIP (missing id/name/profileUrl):", url);
          continue;
        }

        results.push(obj);
        console.log(
          "OK:",
          obj.id,
          obj.name,
          obj.group ? `[group:${obj.group}]` : "[group:]",
          obj.photoUrl ? "[photo:yes]" : "[photo:no]"
        );
      } catch (e) {
        console.log("FAIL:", url, String(e?.message || e));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  const byId = new Map();
  for (const r of results) byId.set(r.id, r);

  const senators = Array.from(byId.values()).sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );

  if (senators.length === 0) {
    throw new Error("Error: parsed senators are empty (0).");
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(senators, null, 2), "utf-8");

  console.log("WROTE:", OUT_PATH, "count:", senators.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
