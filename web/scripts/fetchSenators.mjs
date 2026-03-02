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

function extractCellsFromTr(trHtml) {
  const cells = [];

  // th
  const ths = [...trHtml.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/gi)].map((m) =>
    stripTags(m[1] || "")
  );
  // td
  const tds = [...trHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
    stripTags(m[1] || "")
  );

  if (ths.length > 0) return ths;
  if (tds.length > 0) return tds;
  return cells;
}

/**
 * 一覧ページ(giin.htm)のHTMLから
 * - id, name, yomi, group, profileUrl を抽出
 *
 * 重要：テーブルを特定できない場合があるため、
 * ページ全体の <tr> を走査し、profileリンクを含む行を拾う。
 * ヘッダ行は「会派」「氏名/名前」等を含む行から推定して列Indexを決める。
 */
function extractList(html, baseUrl) {
  const items = [];

  const trs = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  // ヘッダ行を推定（thが無い場合もあるので td 行も対象）
  let idxName = -1;
  let idxYomi = -1;
  let idxGroup = -1;

  const headerTr =
    trs.find((tr) => {
      const cells = extractCellsFromTr(tr).map((t) => t.replace(/\s+/g, ""));
      if (cells.length < 2) return false;
      const hasGroup = cells.some((t) => t.includes("会派"));
      const hasName = cells.some((t) => t.includes("氏名") || t.includes("名前"));
      // よみが無くてもOK（会派/氏名があれば採用）
      return hasGroup && hasName;
    }) || "";

  if (headerTr) {
    const cells = extractCellsFromTr(headerTr).map((t) => t.replace(/\s+/g, ""));
    idxName = cells.findIndex((t) => t.includes("氏名") || t.includes("名前"));
    idxYomi = cells.findIndex((t) => t.includes("よみ") || t.includes("フリガナ"));
    idxGroup = cells.findIndex((t) => t.includes("会派"));
  }

  for (const tr of trs) {
    // profileリンクがある行だけ
    if (!/\/profile\/\d+\.htm/i.test(tr)) continue;

    const hrefMatch = tr.match(
      /<a[^>]*href="([^"]*\/profile\/\d+\.htm)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!hrefMatch) continue;

    const profileUrl = normalizeUrl(hrefMatch[1], baseUrl);
    const nameFromLink = stripTags(hrefMatch[2] || "");

    const cellsRaw = [];
    // tdセル（中身はタグ付きで取ってからstripした方が列が崩れにくい）
    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (m) => m[1] || ""
    );
    for (const td of tds) cellsRaw.push(stripTags(td));

    // 文字だけのセル配列
    const cells = cellsRaw.map((t) => (t ?? "").trim());

    let name = "";
    let yomi = "";
    let group = "";

    if (idxName >= 0 && idxName < cells.length) name = cells[idxName];
    if (idxYomi >= 0 && idxYomi < cells.length) yomi = cells[idxYomi];
    if (idxGroup >= 0 && idxGroup < cells.length) group = cells[idxGroup];

    if (!name) name = nameFromLink;

    // 列Indexが取れなかった場合の保険（会派は末尾寄りにあることが多い）
    if (!group) {
      // 空でないセルを後ろから探す（ただし name と同一は除外）
      for (let i = cells.length - 1; i >= 0; i--) {
        const v = (cells[i] || "").trim();
        if (!v) continue;
        if (v === name) continue;
        group = v;
        break;
      }
    }

    name = name.replace(/：\s*参議院\s*$/g, "").trim();
    yomi = yomi.replace(/：\s*参議院\s*$/g, "").trim();
    group = group.replace(/：\s*参議院\s*$/g, "").trim();

    const idMatch = profileUrl.match(/\/profile\/(\d+)\.htm/i);
    const id = idMatch ? idMatch[1] : profileUrl;

    if (!name || !profileUrl) continue;

    items.push({ id, name, yomi, group, profileUrl });
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
 * /kousei/giin/photo/xxxx.jpg を優先
 */
function extractPhotoUrl(profileHtml, profileUrl) {
  const m1 = profileHtml.match(
    /(https?:\/\/www\.sangiin\.go\.jp\/[^"' ]*\/photo\/[^"' ]+\.jpg)/i
  );
  if (m1) return m1[1];

  const m2 = profileHtml.match(/(\/[^"' ]*\/photo\/[^"' ]+\.jpg)/i);
  if (m2) return normalizeUrl(m2[1], profileUrl);

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

  // プロフィールを順次取得（直列）
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

  const outPath = path.resolve(__dirname, "..", "public", "data", "senators.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(senators, null, 2), "utf-8");

  console.log("Wrote:", outPath);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
