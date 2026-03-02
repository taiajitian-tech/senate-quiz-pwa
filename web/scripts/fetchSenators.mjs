import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  出力先（重要）
  GitHub Pages が読む場所：
  web/public/data/senators.json
*/
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

/*
  現職参議院議員一覧ページ（入口）
  ※「current/giin.htm」から、実際の国会回次（例: /221/giin.htm）へ誘導される
*/
const LIST_LANDING_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const UA = "Mozilla/5.0 (GitHub Actions)";


let LIST_URL = LIST_LANDING_URL;

function resolveActualListUrl(html) {
  // current/giin.htm は「こちら」リンクで実URLへ誘導される
  const m = html.match(/\/giin\/(\d+)\/giin\.htm/i);
  if (m) {
    return new URL(m[0], LIST_LANDING_URL).toString();
  }
  // まれに meta refresh / JS の場合もあるので href から拾う
  const m2 = html.match(/href="([^"]*\/giin\/(\d+)\/giin\.htm)"/i);
  if (m2) {
    return new URL(m2[1], LIST_LANDING_URL).toString();
  }
  return LIST_LANDING_URL;
}

async function getListUrl() {
  const landingHtml = await fetchHTML(LIST_LANDING_URL);
  const actual = resolveActualListUrl(landingHtml);
  return actual;
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.text();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function stripTags(s) {
  return s
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 一覧ページから「名前」と「プロフィールURL」を抽出する
 * - プロフィールは /profile/xxxx.htm
 * - 取得した名前から末尾の「：参議院」等が混入していれば削除
 */
function extractList(html, baseUrl) {
  const items = [];
  const reA =
    /<a[^>]+href="([^"]*\/profile\/\d+\.htm)"[^>]*>([\s\S]*?)<\/a>/gi;

  let m;
  while ((m = reA.exec(html)) !== null) {
    const href = m[1];
    const rawText = stripTags(m[2]);
    if (!rawText) continue;

    // 参議院等の固定文言が混入している場合は除去
    const name = rawText.replace(/[:：]\s*参議院\s*$/u, "").trim();
    if (!name) continue;

    const url = new URL(href, baseUrl).toString();
    items.push({ name, url });
  }

  // URLで重複除去
  const seen = new Set();
  const uniq = [];
  for (const it of items) {
    if (seen.has(it.url)) continue;
    seen.add(it.url);
    uniq.push(it);
  }
  return uniq;
}

/**
 * プロフィールHTMLから
 * - 顔写真URL（/photo/gxxxx.jpg）
 * - 会派（「会派」thのtd）
 * を抽出する
 */
function extractFromProfile(profileHtml, profileUrl) {
  // photo
  let photo = "";
  const mPhoto = profileHtml.match(/\/japanese\/joho1\/kousei\/giin\/photo\/g\d+\.jpg/);
  if (mPhoto) {
    photo = new URL(mPhoto[0], profileUrl).toString();
  }

  // 会派： <th>会派</th> <td>...</td>
  let group = "";
  const mGroup = profileHtml.match(/<th[^>]*>\s*会派\s*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
  if (mGroup) {
    group = stripTags(mGroup[1]);
  } else {
    // フォールバック（「所属会派」など）
    const mGroup2 = profileHtml.match(/所属会派[^<]*<\/th>\s*<td[^>]*>([\s\S]*?)<\/td>/i);
    if (mGroup2) group = stripTags(mGroup2[1]);
  }

  return { photo, group };
}

async function main() {
  console.log("Fetching list...");
  LIST_URL = await getListUrl();
  const listHtml = await fetchHTML(LIST_URL);

  const list = extractList(listHtml, LIST_URL);
  console.log(`Found profiles: ${list.length}`);

  const data = [];
  let id = 1;

  for (const it of list) {
    // サーバー負荷軽減
    await sleep(200);

    let profileHtml = "";
    try {
      profileHtml = await fetchHTML(it.url);
    } catch (e) {
      console.warn(`Profile fetch failed: ${it.url}`);
      data.push({
        id: id++,
        name: it.name,
        images: [],
        group: "",
        source: it.url,
      });
      continue;
    }

    const { photo, group } = extractFromProfile(profileHtml, it.url);

    data.push({
      id: id++,
      name: it.name,
      images: photo ? [photo] : [],
      group: group || "",
      source: it.url,
    });
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf-8");
  console.log(`Generated: ${data.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
