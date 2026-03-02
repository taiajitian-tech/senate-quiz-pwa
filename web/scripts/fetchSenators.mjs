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
  参議院サイトは「current/」が HTML リダイレクト（meta refresh）になっていることがある。
  まず current/giin.htm を取りに行き、そこから最新の「/giin/{回次}/giin.htm」を解決する。
*/
const CURRENT_LIST_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return await res.text();
}

// current/ ページ（meta refresh）から、実体ページURLを取り出す
function resolveMetaRedirect(html, baseUrl) {
  // 例：<a href="...">こちら</a>
  const a = html.match(/<a[^>]+href="([^"]+)"[^>]*>こちら<\/a>/i);
  if (a && a[1]) return new URL(a[1], baseUrl).toString();

  // 例：<meta http-equiv="refresh" content="0;URL=...">
  const meta = html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"'>\s]+)[^"']*["']/i);
  if (meta && meta[1]) return new URL(meta[1], baseUrl).toString();

  return null;
}

// 一覧HTMLから (name, profileUrl, group) を抽出
function extractList(html, pageUrl) {
  const rows = [];

  // table 行っぽいところから anchor を拾う
  // giin.htm は「氏名」「読み方」「会派」… の順でテキストが並ぶため、
  // 1つのリンク（氏名）の直後に「読み方（ひらがな）」が来て、その次に会派略称が来る。
  //
  // ここでは、リンクの後ろ 200 文字程度を見て、最初に出る会派っぽい「短い単語」を group として取る。
  const linkRe = /<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>/g;

  let m;
  while ((m = linkRe.exec(html)) !== null) {
    const href = m[1];
    const nameRaw = m[2].trim();

    // ナビ等を除外
    if (!nameRaw || nameRaw.includes("本文へ") || nameRaw.includes("トップ")) continue;

    // リンク周辺を取り出してタグ除去→空白圧縮
    const context = html.slice(m.index, m.index + 600);
    const text = context
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    // text 例: "青木 愛 あおき あい 立憲 比例 令和10年7月25日"
    // 先頭に氏名があるので、その後ろから会派候補を探す
    const parts = text.split(" ");
    const nameIdx = parts.indexOf(nameRaw);
    if (nameIdx === -1) continue;

    // parts[nameIdx+1...] から、ひらがな読み（2語以上）を飛ばして、その次の短い語を group とする
    let group = "";
    for (let i = nameIdx + 1; i < Math.min(parts.length, nameIdx + 12); i++) {
      const p = parts[i];
      // 読み（ひらがな・長音・中点）を飛ばす
      if (/^[ぁ-んー・]+$/.test(p)) continue;

      // 「比例」「選挙区」「令和」などは会派ではないので飛ばす
      if (p === "比例" || p === "選挙区" || p.startsWith("令和")) continue;

      // 会派略称はだいたい 1〜4 文字程度
      if (p.length <= 6) {
        group = p;
        break;
      }
    }

    const profileUrl = new URL(href, pageUrl).toString();

    // 「＜正字＞」などのリンクが混ざるので、議員個人ページっぽいものだけ残す
    if (!/\/giin\/profile\//.test(profileUrl)) continue;

    rows.push({ name: nameRaw, profileUrl, group });
  }

  // 名前で重複除去
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.name)) map.set(r.name, r);
  }
  return [...map.values()];
}

function normalizeName(name) {
  // 例: "生稲 晃子 [佐山 晃子]" → "生稲 晃子"
  return name.replace(/\s*\[[^\]]+\]\s*/g, "").trim();
}

function extractPhotoUrl(profileHtml, profileUrl) {
  // 例: /japanese/joho1/kousei/giin/photo/g7010018.jpg
  const m = profileHtml.match(/\/japanese\/joho1\/kousei\/giin\/photo\/[^"'\s>]+\.jpg/i)
    || profileHtml.match(/\/kousei\/giin\/photo\/[^"'\s>]+\.jpg/i);
  if (!m) return null;
  return new URL(m[0], profileUrl).toString();
}

async function main() {
  console.log("Resolving current list...");

  const currentHtml = await fetchHTML(CURRENT_LIST_URL);
  const resolved = resolveMetaRedirect(currentHtml, CURRENT_LIST_URL) || CURRENT_LIST_URL;

  console.log(`List URL: ${resolved}`);

  const listHtml = await fetchHTML(resolved);
  const list = extractList(listHtml, resolved);

  console.log(`Found candidates: ${list.length}`);

  const data = [];
  let id = 1;

  for (const item of list) {
    const name = normalizeName(item.name);

    let images = [];
    try {
      const profileHtml = await fetchHTML(item.profileUrl);
      const photo = extractPhotoUrl(profileHtml, item.profileUrl);
      if (photo) images = [photo];
    } catch (e) {
      // プロフィールが落ちていても全体を止めない
      console.warn(`Profile fetch failed: ${item.profileUrl}`);
    }

    // 画像が取れない場合は空配列のまま
    data.push({
      id: id++,
      name,
      images,
      group: item.group || "",
      source: item.profileUrl,
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
