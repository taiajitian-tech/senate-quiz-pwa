// web/scripts/fetchSenators.mjs
// 目的：current/giin.htm から profile リンクのみ収集し、各 profile から情報を確定取得して senators.json を生成する
// 依存：なし（Node標準のみ）

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
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

/**
 * 一覧ページから profile リンクを「href文字列として」抽出する
 * - DOMやtableに依存しない
 * - /profile/xxxx.htm のみを真実として拾う
 */
function extractProfileLinks(entryHtml, entryUrl) {
  const links = new Set();

  // href=".../profile/12345.htm" / href='../profile/12345.htm' 等を拾う
  const re = /href\s*=\s*["']([^"']*\/profile\/\d+\.htm(?:\?[^"']*)?)["']/gi;

  let m;
  while ((m = re.exec(entryHtml)) !== null) {
    const href = m[1];
    const u = absUrl(entryUrl, href);
    if (!u) continue;

    // 参議院ドメイン限定（想定外リンク排除）
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;

    // 正規化：クエリは落とす（同一ページ重複排除）
    const norm = u.replace(/\?.*$/, "");
    links.add(norm);
  }

  return Array.from(links);
}

/**
 * profileページから情報抽出（HTML非正規でも落ちにくいように、複数fallback）
 */
function pickFirst(matchers) {
  for (const m of matchers) {
    if (!m) continue;
    const v = (Array.isArray(m) ? m[1] : m)?.trim?.();
    if (v) return v;
  }
  return "";
}

function htmlUnescape(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return htmlUnescape(
    s
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/p>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? m[1] : "";
}

function extractName(profileHtml) {
  // よくある：<h1>氏名</h1> or <h1>参議院議員　氏名</h1> 等
  const m1 = profileHtml.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const h1 = m1 ? stripTags(m1[1]) : "";

  // 余計な語を落としつつ、最後の連続文字列を名前候補にする（過剰加工はしない）
  // ※ここは「空なら空」で返し、壊れた推測はしない
  return h1.replace(/^参議院議員\s*/g, "").trim();
}

function extractYomi(profileHtml) {
  // ページに「ふりがな」「フリガナ」「よみ」等が入る場合の拾い（無ければ空）
  const candidates = [
    profileHtml.match(/(?:ふりがな|フリガナ|よみ)[\s\S]{0,80}?:?[\s\S]{0,40}<[^>]*>\s*([^<\n\r]{1,40})\s*</i),
    profileHtml.match(/(?:ふりがな|フリガナ|よみ)[\s\S]{0,80}?:?\s*([^<\n\r]{1,40})\s*</i),
  ];
  return pickFirst(candidates);
}

function extractGroup(profileHtml) {
  // 「会派」行を拾う（table/非tableどちらでも拾えるように広め）
  // 例：会派</th><td>◯◯</td> / 会派：◯◯ / 会派　◯◯
  const m1 = profileHtml.match(
    /会派[\s\S]{0,60}?(?:<\/th>\s*<td[^>]*>|：|:\s*|<\/[^>]+>\s*)([\s\S]{1,120}?)(?:<\/td>|<br|<\/tr>|<\/p>|<\/li>|&nbsp;|　|\n|\r)/i
  );
  const v1 = m1 ? stripTags(m1[1]) : "";

  // 末尾のゴミを軽く落とす（空白/句読点程度）
  return v1.replace(/\s+/g, " ").trim();
}

function extractPhotoUrl(profileHtml, profileUrl) {
  // まず profile 内の img から、参議院ドメイン or 相対URL を拾う
  const re = /<img[^>]+src\s*=\s*["']([^"']+)["'][^>]*>/gi;

  let m;
  const candidates = [];
  while ((m = re.exec(profileHtml)) !== null) {
    const src = m[1];
    const u = absUrl(profileUrl, src);
    if (!u) continue;
    if (!u.startsWith("https://www.sangiin.go.jp/")) continue;
    candidates.push(u);
  }

  // それっぽい（photo/giin 等）を優先
  const preferred =
    candidates.find((u) => /\/photo\//i.test(u)) ||
    candidates.find((u) => /\/giin\//i.test(u)) ||
    candidates[0] ||
    "";

  return preferred;
}

async function parseProfile(profileUrl) {
  const html = await fetchText(profileUrl);

  const id = extractIdFromProfileUrl(profileUrl);
  const name = extractName(html);
  const yomi = extractYomi(html);
  const group = extractGroup(html);
  const photoUrl = extractPhotoUrl(html, profileUrl);

  return {
    id,
    name,
    yomi,
    group,
    profileUrl,
    photoUrl,
  };
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const entryHtml = await fetchText(ENTRY_URL);
  const profileLinks = extractProfileLinks(entryHtml, ENTRY_URL);

  console.log("list extracted:", profileLinks.length);

  if (profileLinks.length === 0) {
    // デバッグ用：HTML長だけ残す（ログで確認できる）
    console.log("ENTRY_HTML_LENGTH:", entryHtml.length);
    throw new Error("Error: list is empty (0). parsing failed.");
  }

  // 取得負荷を抑えるため並列数を制限
  const CONCURRENCY = 6;

  const results = [];
  let i = 0;

  async function worker() {
    while (i < profileLinks.length) {
      const idx = i++;
      const url = profileLinks[idx];
      try {
        const obj = await parseProfile(url);

        // 最低限の必須：id と profileUrl
        if (!obj.id || !obj.profileUrl) {
          console.log("SKIP (missing id/profileUrl):", url);
          continue;
        }
        results.push(obj);
        console.log("OK:", obj.id, obj.name || "(no-name)", obj.group || "(no-group)");
      } catch (e) {
        console.log("FAIL:", url, String(e?.message || e));
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => worker());
  await Promise.all(workers);

  // id重複排除（念のため）
  const byId = new Map();
  for (const r of results) byId.set(r.id, r);

  const senators = Array.from(byId.values()).sort((a, b) =>
    String(a.id).localeCompare(String(b.id))
  );

  // 最低限：0件は失敗扱い
  if (senators.length === 0) {
    throw new Error("Error: parsed profiles are empty (0).");
  }

  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(senators, null, 2), "utf-8");

  console.log("WROTE:", OUT_PATH, "count:", senators.length);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
