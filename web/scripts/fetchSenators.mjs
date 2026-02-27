import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 参議院公式「現職参議院議員名簿」
const LIST_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/221/giin.htm";

// 出力先（GitHub Pages で配信される静的JSON）
const OUT_PATH = path.resolve(__dirname, "..", "public", "data", "senators.json");

// 会派（正式表記）→ 略称
const GROUP_ABBR = [
  [/自由民主党/, "自民"],
  [/立憲民主党/, "立憲"],
  [/公明党/, "公明"],
  [/日本維新の会/, "維新"],
  [/国民民主党/, "国民"],
  [/日本共産党/, "共産"],
  [/れいわ新選組/, "れいわ"],
  [/社会民主党/, "社民"],
  [/参政党/, "参政"],
  [/NHK党|ＮＨＫ党|NHKから国民を守る党/, "NHK"],
  [/無所属/, "無所属"],
];

function toAbsUrl(u) {
  if (!u) return "";
  try {
    return new URL(u, LIST_URL).toString();
  } catch {
    return u;
  }
}

function normalizeText(s) {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

function toGroupAbbr(raw) {
  const s = normalizeText(raw);
  if (!s) return "";
  for (const [re, abbr] of GROUP_ABBR) {
    if (re.test(s)) return abbr;
  }
  // 想定外の表記は短くして返す（暴れ防止）
  return s.length > 8 ? s.slice(0, 8) : s;
}

// プロフィールページから顔写真URLを抽出（取れない場合は空文字）
async function fetchProfileImage(profileUrl) {
  if (!profileUrl) return "";
  try {
    const res = await fetch(profileUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; senate-quiz-pwa/1.0; +https://github.com/taiajitian-tech/senate-quiz-pwa)",
      },
    });
    if (!res.ok) return "";
    const html = await res.text();
    const $ = cheerio.load(html);

    // 参議院サイトのプロフィールは画像が1枚あるケースが多い想定。
    // なるべく一般化：最初の<img>のsrcを採用（相対は絶対化）
    const src =
      $("img").first().attr("src") ||
      $("img").first().attr("data-src") ||
      "";
    if (!src) return "";

    try {
      return new URL(src, profileUrl).toString();
    } catch {
      return src;
    }
  } catch {
    return "";
  }
}

// 併走数を抑えた簡易コンカレンシー
async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (i < items.length) {
      const my = i++;
      results[my] = await fn(items[my], my);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const res = await fetch(LIST_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; senate-quiz-pwa/1.0; +https://github.com/taiajitian-tech/senate-quiz-pwa)",
    },
  });
  if (!res.ok) {
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  // 名簿ページの構造差分に備え、プロフィールリンク（profile/*.htm）を起点に抽出
  const raw = [];
  $("a").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/profile\/\d+\.htm/i.test(href)) return;

    const name = normalizeText($(a).text()).replace(/\s/g, "");
    if (!name) return;

    const profileUrl = toAbsUrl(href);

    // 行（tr）/近傍から会派らしき文字列を拾う
    const $row = $(a).closest("tr");
    const rowText = normalizeText($row.text());
    const group = toGroupAbbr(rowText);

    raw.push({ name, group, profileUrl });
  });

  // 重複除去（同名優先）
  const uniq = new Map();
  for (const r of raw) {
    if (!uniq.has(r.name)) uniq.set(r.name, r);
  }
  const baseList = Array.from(uniq.values());

  // 顔写真取得（失敗しても空のまま）
  const withImages = await mapWithConcurrency(baseList, 5, async (r) => {
    const img = await fetchProfileImage(r.profileUrl);
    return {
      ...r,
      img,
    };
  });

  const out = withImages
    .map((r, idx) => ({
      id: idx + 1,
      name: r.name,
      group: r.group ?? "",
      images: r.img ? [r.img] : [],
    }))
    .filter((x) => x.name.length > 0);

  await fs.mkdir(path.dirname(OUT_PATH), { recursive: true });
  await fs.writeFile(OUT_PATH, JSON.stringify(out, null, 2), "utf-8");

  console.log(`Generated: ${OUT_PATH}`);
  console.log(`Count: ${out.length}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
