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

  // 一覧ページ内のテーブルを全部拾い、profileリンクを含むテーブルを対象にする
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const targetTable = tables.find((t) => /\/profile\/\d+\.htm/.test(t)) || html;

  // ヘッダ行（th）から「会派」列の位置を決める
  let groupIdx = -1;
  const headerTr = targetTable.match(/<tr[^>]*>[\s\S]*?<th[\s\S]*?<\/tr>/i);
  if (headerTr) {
    const ths = [...headerTr[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
      stripTags(m[1] || "")
    );
    groupIdx = ths.findIndex((t) => t.includes("会派"));
  }

  // 行ごとに td を取り出す
  const trs = targetTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    // data行のみ（tdがない行はスキップ）
    if (!/<td/i.test(tr)) continue;

    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1] || "");
    if (tds.length === 0) continue;

    // 氏名とプロフィールURL（profileリンク）を行から取得
    const a = tr.match(/<a[^>]*href="([^"]+\/profile\/[^"]+\.htm)"[^>]*>([\s\S]*?)<\/a>/i);
    if (!a) continue;

    const profileUrl = new URL(a[1], baseUrl).href;
    const nameRaw = stripTags(a[2] || "");
    const name = nameRaw.replace(/：\s*参議院\s*$/g, "").trim();

    // 会派列（ヘッダから見つからない場合は最後の列を保険で見る）
    let groupRaw = "";
    if (groupIdx >= 0 && groupIdx < tds.length) {
      groupRaw = stripTags(tds[groupIdx] || "");
    } else if (tds.length >= 1) {
      // 保険：末尾列に会派が入っているケースが多い
      groupRaw = stripTags(tds[tds.length - 1] || "");
    }
    const group = groupRaw.replace(/：\s*参議院\s*$/g, "").trim();

    if (!name) continue;
    items.push({ name, group, profileUrl });
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
