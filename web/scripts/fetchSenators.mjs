import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/*
  出力先（GitHub Pages が読む場所）
  web/public/data/senators.json
*/
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

/*
  現職参議院議員一覧（50音順）
  ※ /current/ は毎回「第xxx回国会」(例: /221/) にリダイレクトされるため、
     response.url を使って実体URLへ追従する。
*/
const LIST_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

async function fetchHTML(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status}: ${url}`);
  }

  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

/*
  一覧ページの表から、(氏名, 会派, プロフィールURL) を抽出する。
  参照：一覧の列見出しに「会派」があり、各行に略称が入っている。 
*/
function extractList(html, baseUrl) {
  const items = [];
  // <a href="...">氏名</a> の後に、読み方・会派が続くテーブル構造を前提に拾う
  const rowRe =
    /<tr[^>]*>\s*<td[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td[^>]*>\s*([^<]*)<\/td>\s*<td[^>]*>\s*([^<]*)<\/td>/g;

  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const href = m[1]?.trim();
    const nameRaw = stripTags(m[2] || "");
    const groupRaw = stripTags(m[4] || ""); // 3列目=会派

    if (!href || !nameRaw) continue;

    // 氏名の末尾に「：参議院」等が紛れた場合の保険
    const name = nameRaw.replace(/：\s*参議院\s*$/g, "").trim();
    const group = groupRaw.replace(/：\s*参議院\s*$/g, "").trim();

    // 例: https://www.sangiin.go.jp/japanese/joho1/kousei/giin/profile/....
    const profileUrl = new URL(href, baseUrl).href;

    items.push({ name, group, profileUrl });
  }

  // 取りこぼしがある場合に備え、別パターン（表構造が崩れた時）も拾う
  if (items.length === 0) {
    const aRe = /<a[^>]*href="([^"]+\/profile\/[^"]+\.htm)"[^>]*>([^<]+)<\/a>/g;
    while ((m = aRe.exec(html)) !== null) {
      const profileUrl = new URL(m[1], baseUrl).href;
      const name = stripTags(m[2] || "").replace(/：\s*参議院\s*$/g, "").trim();
      if (name) items.push({ name, group: "", profileUrl });
    }
  }

  // 重複除去（profileUrl優先）
  const seen = new Set();
  return items.filter((x) => {
    const key = x.profileUrl || x.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function extractPhotoUrl(profileHtml, profileUrl) {
  // 代表的なパターン（絶対・相対両対応）
  const patterns = [
    /https:\/\/www\.sangiin\.go\.jp\/japanese\/joho1\/kousei\/giin\/photo\/[^"']+\.jpg/i,
    /\/japanese\/joho1\/kousei\/giin\/photo\/[^"']+\.jpg/i,
    /\.\.\/photo\/[^"']+\.jpg/i,
  ];

  for (const re of patterns) {
    const m = profileHtml.match(re);
    if (m && m[0]) {
      return new URL(m[0], profileUrl).href;
    }
  }
  return null;
}

async function buildSenators(listItems) {
  const out = [];
  for (let i = 0; i < listItems.length; i++) {
    const it = listItems[i];
    try {
      const { html: pHtml } = await fetchHTML(it.profileUrl);
      const photo = extractPhotoUrl(pHtml, it.profileUrl);
      out.push({
        id: i + 1,
        name: it.name,
        images: photo ? [photo] : [],
        group: it.group || "",
        source: it.profileUrl,
      });
    } catch (e) {
      // 1人落ちても全体停止しない（更新継続）
      out.push({
        id: i + 1,
        name: it.name,
        images: [],
        group: it.group || "",
        source: it.profileUrl,
        error: String(e?.message || e),
      });
    }
  }
  return out;
}

async function main() {
  console.log("Fetching list...");
  const { html, finalUrl } = await fetchHTML(LIST_URL);

  console.log("List resolved to:", finalUrl);

  const listItems = extractList(html, finalUrl);
  console.log(`Found rows: ${listItems.length}`);

  const data = await buildSenators(listItems);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(data, null, 2), "utf-8");

  console.log("Wrote:", OUTPUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
