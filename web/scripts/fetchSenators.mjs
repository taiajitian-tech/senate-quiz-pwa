// web/scripts/fetchSenators.mjs
// 参議院「現職議員一覧(current入口)」→ 一覧表から氏名/よみ/会派/プロフィールURL
// → 各プロフィールから顔写真URL取得 → web/public/data/senators.json に保存

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 参議院 現職一覧（入口：固定）
const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

function stripTags(s) {
  return (s ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeUrl(u, base) {
  try {
    return new URL(u, base).href;
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent":
        "Mozilla/5.0 (GitHub Actions) senate-quiz-pwa update script",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} ${res.statusText}: ${url}`);
  }
  return await res.text();
}

/**
 * 一覧ページ(giin.htm)のHTMLから
 * - name, yomi, group, profileUrl を抽出
 * テーブルのthから「会派」列を特定して読む（列ずれ対策）
 */
function extractList(html, baseUrl) {
  const items = [];

  // tableを全取得し、profileリンクを含むtableをターゲットに
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) || [];
  const targetTable =
    tables.find((t) => /\/profile\/\d+\.htm/i.test(t)) || "";

  if (!targetTable) return items;

  // ヘッダ(th)から列Indexを決める
  let idxName = -1;
  let idxYomi = -1;
  let idxGroup = -1;

  const headerTrMatch = targetTable.match(
    /<tr[^>]*>[\s\S]*?<th[\s\S]*?<\/tr>/i
  );
  if (headerTrMatch) {
    const ths = [...headerTrMatch[0].matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)]
      .map((m) => stripTags(m[1] || ""))
      .map((t) => t.replace(/\s+/g, ""));

    idxName = ths.findIndex((t) => t.includes("氏名") || t.includes("名前"));
    idxYomi = ths.findIndex((t) => t.includes("よみ") || t.includes("フリガナ"));
    idxGroup = ths.findIndex((t) => t.includes("会派"));
  }

  const trs = targetTable.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  for (const tr of trs) {
    if (!/<td/i.test(tr)) continue;

    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => m[1] || ""
    );
    if (tds.length === 0) continue;

    // プロフィールリンク
    const a = tr.match(
      /<a[^>]*href="([^"]*\/profile\/\d+\.htm)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!a) continue;

    const profileUrl = normalizeUrl(a[1], baseUrl);
    const nameFromLink = stripTags(a[2] || "");

    // name/yomi/group を列から読む（無理なら保険でlink text）
    let name = "";
    let yomi = "";
    let group = "";

    if (idxName >= 0 && idxName < tds.length) name = stripTags(tds[idxName]);
    if (idxYomi >= 0 && idxYomi < tds.length) yomi = stripTags(tds[idxYomi]);
    if (idxGroup >= 0 && idxGroup < tds.length) group = stripTags(tds[idxGroup]);

    if (!name) name = nameFromLink;

    // 余計な末尾表記が混ざる場合の保険
    name = name.replace(/：\s*参議院\s*$/g, "").trim();
    yomi = yomi.replace(/：\s*参議院\s*$/g, "").trim();
    group = group.replace(/：\s*参議院\s*$/g, "").trim();

    // id（プロフィールの数字）
    const idMatch = profileUrl.match(/\/profile\/(\d+)\.htm/i);
    const id = idMatch ? idMatch[1] : profileUrl;

    if (!name || !profileUrl) continue;

    items.push({
      id,
      name,
      yomi,
      group,
      profileUrl,
    });
  }

  // 重複除去（id優先）
  const seen = new Set();
  return items.filter((x) => {
    const k = x.id || x.profileUrl || x.name;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/**
 * プロフィールHTMLから顔写真URLを抽出
 * 参議院サイトは /kousei/giin/photo/xxxx.jpg の形式が多いのでそれを優先
 */
function extractPhotoUrl(profileHtml, profileUrl) {
  // まずは明確に photo ディレクトリのjpgを探す
  const m1 = profileHtml.match(
    /(https?:\/\/www\.sangiin\.go\.jp\/[^"' ]*\/photo\/[^"' ]+\.jpg)/i
  );
  if (m1) return m1[1];

  const m2 = profileHtml.match(/(\/[^"' ]*\/photo\/[^"' ]+\.jpg)/i);
  if (m2) return normalizeUrl(m2[1], profileUrl);

  // 次に img src から jpg を探す
  const imgs = [...profileHtml.matchAll(/<img[^>]*src="([^"]+)"/gi)].map(
    (x) => x[1]
  );
  const jpg = imgs.find((u) => /\.jpe?g(\?|$)/i.test(u));
  if (jpg) return normalizeUrl(jpg, profileUrl);

  return "";
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const listHtml = await fetchText(ENTRY_URL);
  const baseUrl = ENTRY_URL;

  const list = extractList(listHtml, baseUrl);
  console.log("list extracted:", list.length);

  if (!Array.isArray(list) || list.length === 0) {
    throw new Error("list is empty (0). parsing failed.");
  }

  // プロフィールを順次取得（負荷を避けるため直列）
  const senators = [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    try {
      const pHtml = await fetchText(s.profileUrl);
      const photoUrl = extractPhotoUrl(pHtml, s.profileUrl);

      senators.push({
        id: s.id,
        name: s.name,
        yomi: s.yomi ?? "",
        group: s.group ?? "",
        profileUrl: s.profileUrl,
        photoUrl: photoUrl,
      });
    } catch (e) {
      console.log("profile fetch failed:", s.profileUrl, String(e));
      // 失敗しても最低限一覧データは残す（画像だけ空）
      senators.push({
        id: s.id,
        name: s.name,
        yomi: s.yomi ?? "",
        group: s.group ?? "",
        profileUrl: s.profileUrl,
        photoUrl: "",
      });
    }
  }

  console.log("senators count:", senators.length);

  if (!Array.isArray(senators) || senators.length === 0) {
    throw new Error("senators is empty (0). abort writing senators.json");
  }

  // 出力先：web/public/data/senators.json
  const outPath = path.resolve(__dirname, "..", "public", "data", "senators.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(senators, null, 2), "utf-8");

  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
