import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 出力先（GitHub Pages が読む場所）
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

// 入口（固定URL /current/ は実体URLに追従する）
const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

// 参議院サイトの写真URLは profile id から確定で作れる（g + id）
const photoUrlFromId = (id) =>
  `https://www.sangiin.go.jp/japanese/joho1/kousei/giin/photo/g${id}.jpg`;

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`Fetch failed ${res.status}: ${url}`);
  return { text: await res.text(), finalUrl: res.url || url };
}

function normalizeWS(s) {
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/\u00a0/g, " ")
    .replace(/[ ]{2,}/g, " ")
    .trim();
}

function stripTags(html) {
  // script/style を先に除去
  const noScript = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "");

  // 改行に寄せたいタグ
  const withNL = noScript
    .replace(/<\s*br\s*\/?>/gi, "\n")
    .replace(/<\s*\/p\s*>/gi, "\n")
    .replace(/<\s*\/tr\s*>/gi, "\n")
    .replace(/<\s*\/li\s*>/gi, "\n")
    .replace(/<\s*\/h\d\s*>/gi, "\n");

  return normalizeWS(withNL.replace(/<[^>]*>/g, " "));
}

function cleanName(name) {
  return normalizeWS(name)
    // 旧姓などの角括弧表記を落とす（例：生稲 晃子［佐山 晃子］）
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s*［[^］]+］\s*/g, " ")
    .trim();
}

function extractRealListUrl(entryHtml, entryFinalUrl) {
  // entry は軽量HTMLのことがあるため、href を直接拾う
  // 優先順位：giinmei.htm（会派見出しが取れる） > giin.htm
  const candidates = [];
  for (const re of [
    /\/japanese\/joho1\/kousei\/giin\/(\d{3,})\/giinmei\.htm/gi,
    /\/japanese\/joho1\/kousei\/giin\/(\d{3,})\/giin\.htm/gi,
  ]) {
    for (const m of entryHtml.matchAll(re)) {
      candidates.push(new URL(m[0], entryFinalUrl).href);
    }
  }
  // response.url だけで実体に飛べる場合もある
  if (candidates.length === 0 && /\/giin\/\d+\//.test(entryFinalUrl)) {
    // giin.htm の場合は giinmei.htm を試す
    const maybe = entryFinalUrl.replace(/\/giin\.htm$/, "/giinmei.htm");
    candidates.push(maybe);
    candidates.push(entryFinalUrl);
  }
  if (candidates.length === 0) return null;
  // 一番先頭（優先順で入れている）
  return candidates[0];
}

function parseListPage(listHtml, listUrl) {
  // 方針：
  // - /profile/\d+.htm のリンクを row 単位で抽出
  // - row の td から (name, yomi, district) を拾う
  // - 会派は「会派見出し（〜（n名））」の直後のテーブルに紐づく想定で、
  //   row の直前に現れる見出しを採用（失敗したら空）

  const html = listHtml;
  const groupHeaders = [];

  // 会派見出しらしき文字列：〜（数字名） かつ 党/無所属 を含む
  const groupRe =
    /(^|[>\n])\s*([^<>\n]{2,60}?(?:党|無所属)[^<>\n]{0,20}?)\s*[（(]\s*\d+\s*名\s*[）)]/g;
  for (const m of html.matchAll(groupRe)) {
    const label = normalizeWS(m[2]);
    if (!label) continue;
    groupHeaders.push({ idx: m.index ?? 0, label });
  }
  groupHeaders.sort((a, b) => a.idx - b.idx);

  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const out = [];

  for (const tr of rows) {
    const a = tr.match(
      /<a[^>]*href="([^"]*\/profile\/(\d+)\.htm)"[^>]*>([\s\S]*?)<\/a>/i
    );
    if (!a) continue;

    const profileUrl = new URL(a[1], listUrl).href;
    const profileId = a[2];
    const name = cleanName(stripTags(a[3] || ""));

    const tds = [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      stripTags(m[1] || "")
    );
    // 想定： [0]=氏名, [1]=ふりがな, [2]=選挙区...
    const yomi = normalizeWS(tds[1] || "");
    const district = normalizeWS(tds[2] || "");

    // この tr が listHtml 内のどこにあるかを探し、直前の見出しを会派候補に
    const pos = html.indexOf(tr);
    let groupHint = "";
    if (pos >= 0 && groupHeaders.length > 0) {
      for (let i = groupHeaders.length - 1; i >= 0; i--) {
        if (groupHeaders[i].idx <= pos) {
          groupHint = groupHeaders[i].label;
          break;
        }
      }
    }

    if (!profileId || !name) continue;
    out.push({ profileId, name, yomi, district, groupHint, profileUrl });
  }

  // 重複除去（profileId）
  const seen = new Set();
  return out.filter((x) => {
    if (seen.has(x.profileId)) return false;
    seen.add(x.profileId);
    return true;
  });
}

function extractGroupFromProfile(profileHtml) {
  // profileページは「所属会派」「選挙区・比例区／当選年／当選回数」が比較的安定
  const text = stripTags(profileHtml)
    .replace(/\s*\/\s*/g, "／")
    .replace(/[ ]{2,}/g, " ");

  // まず「所属会派」直後の1行を優先
  const m = text.match(/所属会派\s*\n?\s*([^\n]{1,60})/);
  if (m && m[1]) {
    const v = normalizeWS(m[1]);
    // 「選挙区...」が混ざる事故を防ぐ
    if (v && !/選挙区|比例区|当選/.test(v)) return v;
  }

  // 保険：所属会派〜次ラベル の範囲
  const m2 = text.match(
    /所属会派([\s\S]{0,120}?)(選挙区・比例区|選挙区・比例区／当選年|参議院における役職)/
  );
  if (m2 && m2[1]) {
    const v = normalizeWS(m2[1])
      .split("\n")
      .map(normalizeWS)
      .find(Boolean);
    if (v && !/選挙区|比例区|当選/.test(v)) return v;
  }

  return "";
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) break;
      results[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);
  const { text: entryHtml, finalUrl: entryFinalUrl } = await fetchText(ENTRY_URL);

  const listUrl = extractRealListUrl(entryHtml, entryFinalUrl);
  if (!listUrl) throw new Error("Failed to resolve list url from entry page.");

  console.log("LIST_URL:", listUrl);
  const { text: listHtml } = await fetchText(listUrl);

  const list = parseListPage(listHtml, listUrl);
  console.log("list extracted:", list.length);
  if (list.length === 0) {
    console.log("ENTRY_HTML_LENGTH:", entryHtml.length);
    console.log("LIST_HTML_LENGTH:", listHtml.length);
    throw new Error("Error: list is empty (0). parsing failed.");
  }

  // 各プロフィールから会派を確定（失敗時は groupHint を採用）
  const enriched = await mapLimit(list, 8, async (it) => {
    let group = it.groupHint || "";
    try {
      const { text: pHtml } = await fetchText(it.profileUrl);
      const g = extractGroupFromProfile(pHtml);
      if (g) group = g;
    } catch {
      // ignore
    }

    const photoUrl = photoUrlFromId(it.profileId);
    return {
      // 既存UI互換（Quiz.tsx 用）
      id: Number(it.profileId),
      name: it.name,
      group,
      images: [photoUrl],

      // 将来の拡張（要件のJSON構造）
      yomi: it.yomi || "",
      district: it.district || "",
      profileUrl: it.profileUrl,
      photoUrl,
    };
  });

  // id で安定ソート
  enriched.sort((a, b) => (a.id || 0) - (b.id || 0));

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(enriched, null, 2), "utf-8");
  console.log("Wrote:", OUTPUT_PATH);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
