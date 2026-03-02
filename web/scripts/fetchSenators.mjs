import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 出力先（GitHub Pages が読む場所）
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

// 固定入口（実体URL番号は変動するため current を使用）
const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

function stripTags(s) {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// current/giin.htm が「中継HTML」を返す場合に、HTML内から実体URLを抽出して追従する
function extractRealListUrl(entryHtml, entryUrl) {
  // 1) 直書きパス（相対/絶対）
  const m1 =
    entryHtml.match(/https?:\/\/www\.sangiin\.go\.jp\/japanese\/joho1\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/\/japanese\/joho1\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/giin\/\d+\/giin\.htm/i);

  if (m1?.[0]) return absUrl(entryUrl, m1[0]);

  // 2) meta refresh: content="0;URL=..."
  const m2 = entryHtml.match(/http-equiv\s*=\s*["']refresh["'][^>]*content\s*=\s*["'][^"']*url=([^"']+)["']/i);
  if (m2?.[1]) return absUrl(entryUrl, m2[1]);

  // 3) JS: location.href='...'
  const m3 = entryHtml.match(/location(?:\.href)?\s*=\s*["']([^"']+giin\/\d+\/giin\.htm[^"']*)["']/i);
  if (m3?.[1]) return absUrl(entryUrl, m3[1]);

  return null;
}

// 一覧HTMLから profile リンク（/profile/xxxx.htm）だけ収集（table構造には依存しない）
function extractProfileLinks(listHtml, baseUrl) {
  const links = new Set();

  const re = /href\s*=\s*["']([^"']*profile\/\d+\.htm[^"']*)["']/gi;

  let m;
  while ((m = re.exec(listHtml)) !== null) {
    const href = m[1];
    const u = absUrl(baseUrl, href);
    if (!u) continue;
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;
    links.add(u.replace(/\?.*$/, ""));
  }
  return Array.from(links);
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? Number(m[1]) : NaN;
}

function extractName(profileHtml) {
  // 1) h1
  const h1 = profileHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name1 = h1 ? stripTags(h1[1]) : "";
  const cleaned1 = name1.replace(/^参議院議員\s*/g, "").trim();
  if (cleaned1) return cleaned1;

  // 2) og:title
  const og = profileHtml.match(
    /<meta\s+property\s*=\s*["']og:title["']\s+content\s*=\s*["']([^"']+)["'][^>]*>/i
  );
  const ogTitle = og ? stripTags(og[1]) : "";
  const cleanedOg = ogTitle.replace(/^参議院議員\s*/g, "").replace(/[:：].*$/, "").trim();
  if (cleanedOg) return cleanedOg;

  // 3) title
  const t = profileHtml.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = t ? stripTags(t[1]) : "";
  const cleanedT = title
    .replace(/^参議院議員\s*/g, "")
    .replace(/[:：].*$/, "")
    .replace(/\s*\-\s*.*$/, "")
    .trim();
  if (cleanedT) return cleanedT;

  return "";
}

function extractGroup(profileHtml) {
  // 1) 典型：<th>会派</th><td>...</td>
  const m1 = profileHtml.match(
    /<th[^>]*>\s*会派\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i
  );
  if (m1?.[1]) {
    const v = stripTags(m1[1]);
    if (looksLikeGroup(v)) return v;
  }

  // 2) 典型：<dt>会派</dt><dd>...</dd>
  const m2 = profileHtml.match(
    /<dt[^>]*>\s*会派\s*<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
  );
  if (m2?.[1]) {
    const v = stripTags(m2[1]);
    if (looksLikeGroup(v)) return v;
  }

  // 3) 最後の保険：ただし値が「会派っぽい」ものだけ通す
  const m3 = profileHtml.match(
    /会派[\s\S]{0,80}?(?:<\/th>\s*<td[^>]*>|：|:\s*|<\/[^>]+>\s*)([\s\S]{1,160}?)(?:<\/td>|<br|<\/tr>|<\/p>|<\/li>|\n|\r)/i
  );
  const v3 = m3?.[1] ? stripTags(m3[1]) : "";
  return looksLikeGroup(v3) ? v3 : "";
}

// 会派名らしい文字列だけ採用（県名・短すぎる文字列を弾く）
function looksLikeGroup(v) {
  if (!v) return false;

  // 県名・選挙区っぽい短い文字（岐阜/石川 など）を弾く
  if (v.length <= 4 && !/[党会]/.test(v)) return false;

  // 会派にありがちな語
  if (/(党|無所属|会|クラブ|連合|公明|立憲|自民|維新|国民|共産|れいわ|社民)/.test(v)) return true;

  // 上に引っかからない場合は保守的に不採用
  return false;
}

function extractPhoto(profileHtml, profileUrl) {
  // まず /photo/ を優先的に拾う
  const p1 = profileHtml.match(/\/japanese\/joho1\/kousei\/giin\/photo\/[^"']+\.jpg/i);
  if (p1?.[0]) return absUrl(profileUrl, p1[0]);

  // 次にimg src から jpg を拾う
  const imgs = [...profileHtml.matchAll(/<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(
    (x) => x[1]
  );
  for (const src of imgs) {
    if (!src) continue;
    if (!/\.jpe?g(\?|$)/i.test(src)) continue;
    const u = absUrl(profileUrl, src);
    if (!u) continue;
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;
    return u.replace(/\?.*$/, "");
  }

  return "";
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const { html: entryHtml, finalUrl: entryFinal } = await fetchText(ENTRY_URL);

  const realListUrl = extractRealListUrl(entryHtml, entryFinal || ENTRY_URL);
  const listUrl = realListUrl || (entryFinal || ENTRY_URL);

  if (realListUrl) console.log("FOLLOW_REAL_LIST_URL:", realListUrl);

  const { html: listHtml, finalUrl: listFinal } = realListUrl
    ? await fetchText(realListUrl)
    : { html: entryHtml, finalUrl: listUrl };

  console.log("LIST_URL_FINAL:", listFinal || listUrl);
  console.log("LIST_HTML_LENGTH:", listHtml.length);

  const profileLinks = extractProfileLinks(listHtml, listFinal || listUrl);
  console.log("profile links extracted:", profileLinks.length);

  if (profileLinks.length === 0) {
    throw new Error("Error: profile links are empty (0).");
  }

  // 並列制限
  const CONCURRENCY = 6;
  let idx = 0;
  const out = [];
  const seenIds = new Set();

  async function worker() {
    while (idx < profileLinks.length) {
      const my = idx++;
      const url = profileLinks[my];

      try {
        const { html: pHtml } = await fetchText(url);

        const id = extractIdFromProfileUrl(url);
        const name = extractName(pHtml);
        const group = extractGroup(pHtml);
        const photo = extractPhoto(pHtml, url);

        if (!Number.isFinite(id) || !name) {
          console.log("SKIP:", url, "(missing id/name)");
          continue;
        }
        if (seenIds.has(id)) continue;
        seenIds.add(id);

        out.push({
          id: String(id),
          name,
          yomi: "",
          group: group || "",
          profileUrl: url,
          photoUrl: photo || "",
        });

        console.log("OK:", id, name, group || "(no-group)", photo ? "(photo)" : "(no-photo)");
      } catch (e) {
        console.log("FAIL:", url, String(e?.message || e));
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  if (out.length === 0) {
    throw new Error("Error: parsed senators are empty (0).");
  }

  // id昇順
  out.sort((a, b) => Number(a.id) - Number(b.id));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(out, null, 2), "utf-8");

  console.log("WROTE:", OUTPUT_PATH, "count:", out.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
