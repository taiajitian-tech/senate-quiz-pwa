import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CURRENT_MEIBO_URL = "https://www.kantei.go.jp/jp/105/meibo/index.html";
const OUTPUT_PATH = path.resolve(__dirname, "../public/data/ministers.json");
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36";
const DDG_HTML_URL = "https://html.duckduckgo.com/html/";

function normalizeWhitespace(text) {
  return String(text ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/[\t\r]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeName(text) {
  return normalizeWhitespace(text)
    .replace(/（[^）]*）/g, "")
    .replace(/\([^)]*\)/g, "")
    .replace(/[：:].*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function toAbsoluteUrl(url, base) {
  if (!url) return "";
  try {
    return new URL(url, base).toString();
  } catch {
    return "";
  }
}

function isStopLine(text) {
  return (
    text.includes("副大臣名簿") ||
    text.includes("大臣政務官名簿") ||
    text.includes("内閣総理大臣補佐官名簿") ||
    text.includes("内閣ページに戻る")
  );
}

function isSkippableLine(text) {
  return (
    !text ||
    text === "閣僚等名簿" ||
    text === "第２次高市内閣" ||
    text === "第２次高市内閣 閣僚名簿" ||
    text === "令和８年２月１８日発足" ||
    text === "職名 氏名 備考"
  );
}

function parseProfileAnchors(html, baseUrl) {
  const $ = cheerio.load(html);
  const anchors = [];

  $('a[href*="/meibo/daijin/"]').each((_, a) => {
    const href = toAbsoluteUrl($(a).attr("href"), baseUrl);
    if (!href) return;
    anchors.push({
      href,
      text: normalizeWhitespace($(a).text()),
    });
  });

  return anchors;
}

function buildTokenizedLines(html, baseUrl) {
  const anchors = parseProfileAnchors(html, baseUrl);
  const $ = cheerio.load(html);

  $('a[href*="/meibo/daijin/"]').each((index, a) => {
    const text = normalizeWhitespace($(a).text());
    $(a).replaceWith(`[[MINISTER:${index}:${text}]]`);
  });

  const lines = $("body")
    .text()
    .split("\n")
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  return { anchors, lines };
}

function extractNameAndChamberFromTokenLine(line, tokenText) {
  const lineWithoutToken = normalizeWhitespace(line.replace(tokenText, ""));
  const chamberMatch = lineWithoutToken.match(/(衆議院|参議院)$/);
  const chamber = chamberMatch ? chamberMatch[1] : "";

  const anchorText = tokenText.replace(/^\[\[MINISTER:\d+:/, "").replace(/\]\]$/, "");
  let rawName = normalizeWhitespace(anchorText);
  if (chamber) {
    rawName = normalizeWhitespace(rawName.replace(new RegExp(`${chamber}$`), ""));
  }

  const name = normalizeName(rawName);
  return { name, chamber };
}

function parseEntriesFromLines(lines, anchors) {
  const firstTokenIndex = lines.findIndex((line) => line.includes("[[MINISTER:"));
  if (firstTokenIndex === -1) {
    throw new Error("Could not locate minister entries on current cabinet page");
  }

  let startIndex = lines.findIndex((line, index) => index <= firstTokenIndex && line === "職名 氏名 備考");
  if (startIndex === -1) {
    startIndex = lines.findIndex((line, index) => index <= firstTokenIndex && line.includes("閣僚名簿"));
  }
  if (startIndex === -1) startIndex = 0;

  const entries = [];
  let roleLines = [];

  for (let i = startIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (isStopLine(line)) break;
    if (isSkippableLine(line)) continue;

    const tokenMatch = line.match(/\[\[MINISTER:(\d+):.*?\]\]/);
    if (tokenMatch) {
      const tokenIndex = Number(tokenMatch[1]);
      const tokenText = tokenMatch[0];
      const anchor = anchors[tokenIndex] || { href: "", text: "" };
      const { name, chamber } = extractNameAndChamberFromTokenLine(line, tokenText);

      entries.push({
        name,
        chamber,
        role: roleLines.join(" / "),
        profileUrl: anchor.href,
      });
      roleLines = [];
      continue;
    }

    roleLines.push(line.replace(/^・\s*/, ""));
  }

  return entries.filter((entry) => entry.role || entry.name || entry.profileUrl);
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function extractProfileData(html, url) {
  const $ = cheerio.load(html);

  const h1 = normalizeWhitespace($("h1").first().text());
  const name = normalizeName(h1);
  const role = normalizeWhitespace($("h1").first().nextAll().filter((_, el) => $(el).text().trim()).first().text());

  const og = $('meta[property="og:image"], meta[name="og:image"]').attr("content");
  if (og) {
    return {
      name,
      role,
      imageUrl: toAbsoluteUrl(og, url),
    };
  }

  const img = $("img")
    .filter((_, el) => {
      const src = $(el).attr("src");
      const alt = normalizeWhitespace($(el).attr("alt"));
      if (!src) return false;
      if (/logo|banner|icon|facebook|line|header|footer|spacer/i.test(src)) return false;
      if (/顔写真|顔/.test(alt)) return true;
      return !/logo|banner|icon/i.test(alt);
    })
    .first();

  return {
    name,
    role,
    imageUrl: img.length ? toAbsoluteUrl(img.attr("src"), url) : "",
  };
}

function extractBestImageFromGenericPage(html, url) {
  const $ = cheerio.load(html);

  const og = $('meta[property="og:image"], meta[name="og:image"]').attr("content");
  if (og) return toAbsoluteUrl(og, url);

  const twitter = $('meta[name="twitter:image"], meta[property="twitter:image"]').attr("content");
  if (twitter) return toAbsoluteUrl(twitter, url);

  const img = $("img")
    .filter((_, el) => {
      const src = $(el).attr("src");
      if (!src) return false;
      if (/logo|banner|icon|facebook|line|header|footer|spacer/i.test(src)) return false;
      return true;
    })
    .first();

  return img.length ? toAbsoluteUrl(img.attr("src"), url) : "";
}

async function searchDuckDuckGo(query) {
  const res = await fetch(DDG_HTML_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
    },
    body: new URLSearchParams({ q: query }).toString(),
  });
  if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
  return await res.text();
}

function extractSearchResults(html) {
  const $ = cheerio.load(html);
  const results = [];

  $("a.result__a, a[href]").each((_, a) => {
    const href = $(a).attr("href");
    const text = normalizeWhitespace($(a).text());
    const url = toAbsoluteUrl(href, DDG_HTML_URL);
    if (!url || !text) return;
    if (/duckduckgo\.com/.test(url)) return;
    results.push({ title: text, url });
  });

  return results;
}

async function resolveFallbackImage(name) {
  const searchPlans = [
    { query: `${name} site:kantei.go.jp`, allowed: (u) => /kantei\.go\.jp/.test(u) },
    { query: `${name} site:go.jp`, allowed: (u) => /(^|\.)go\.jp\//.test(u) },
    { query: `${name} 公式サイト`, allowed: (u) => !/wikipedia\.org/.test(u) },
    { query: `${name} Wikipedia`, allowed: (u) => /wikipedia\.org/.test(u) },
  ];

  for (const plan of searchPlans) {
    try {
      const html = await searchDuckDuckGo(plan.query);
      const results = extractSearchResults(html).filter((result) => plan.allowed(result.url));
      for (const result of results.slice(0, 5)) {
        try {
          const pageHtml = await fetchText(result.url);
          const imageUrl = extractBestImageFromGenericPage(pageHtml, result.url);
          if (imageUrl) return imageUrl;
        } catch {
          // continue
        }
      }
    } catch {
      // continue
    }
  }

  return "";
}

function stableIdFromName(name) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)) % 1000000;
  return 9000000 + hash;
}

function defaultCurrentData() {
  return [
    {
      id: 9683514,
      name: "高市 早苗",
      group: "内閣総理大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/takaichi_sanae_001.jpeg"],
    },
    {
      id: 9761321,
      name: "林 芳正",
      group: "総務大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/hayashi_yoshimasa.jpg"],
    },
    {
      id: 9345622,
      name: "平口 洋",
      group: "法務大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/hiraguchi_hiroshi.jpg"],
    },
    {
      id: 9660806,
      name: "茂木 敏充",
      group: "外務大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/motegi_toshimitsu_r.jpg"],
    },
    {
      id: 9843847,
      name: "片山 さつき",
      group: "財務大臣 / 内閣府特命担当大臣（金融） / 租税特別措置・補助金見直し担当 / 参議院",
      images: ["https://www.kantei.go.jp/jp/content/katayama_satsuki.jpg"],
    },
    {
      id: 9484852,
      name: "松本 洋平",
      group: "文部科学大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/matsumoto_youhei.jpg"],
    },
    {
      id: 9119122,
      name: "上野 賢一郎",
      group: "厚生労働大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/ueno_kenichirou.jpg"],
    },
    {
      id: 9999504,
      name: "鈴木 憲和",
      group: "農林水産大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/suzuki_norikazu.jpg"],
    },
    {
      id: 9487976,
      name: "赤澤 亮正",
      group: "経済産業大臣 / 原子力経済被害担当 / ＧＸ実行推進担当 / 産業競争力担当 / 国際博覧会担当 / 内閣府特命担当大臣（原子力損害賠償・廃炉等支援機構） / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/akazawa_ryousei.jpg"],
    },
    {
      id: 9663930,
      name: "金子 恭之",
      group: "国土交通大臣 / 水循環政策担当 / 国際園芸博覧会担当 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/kaneko_yasushi.jpg"],
    },
    {
      id: 9348384,
      name: "石原 宏高",
      group: "環境大臣 / 内閣府特命担当大臣（原子力防災） / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/000192617.jpg"],
    },
    {
      id: 9779776,
      name: "小泉 進次郎",
      group: "防衛大臣 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/koizumi_shinjirou.jpg"],
    },
    {
      id: 9232406,
      name: "木原 稔",
      group: "内閣官房長官 / 沖縄基地負担軽減担当 / 拉致問題担当 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/kihara_minoru.jpg"],
    },
    {
      id: 9486224,
      name: "松本 尚",
      group: "デジタル大臣 / デジタル行財政改革担当 / 行政改革担当 / 国家公務員制度担当 / サイバー安全保障担当 / 内閣府特命担当大臣（サイバー安全保障） / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/matsumoto_hisashi.jpg"],
    },
    {
      id: 9402702,
      name: "牧野 たかお",
      group: "復興大臣 / 福島原発事故再生総括担当 / 防災庁設置準備担当 / 国土強靱化担当 / 参議院",
      images: ["https://www.kantei.go.jp/jp/content/makino_takao.jpg"],
    },
    {
      id: 9414831,
      name: "あかま 二郎",
      group: "国家公安委員会委員長 / 領土問題担当 / 内閣府特命担当大臣（防災 海洋政策） / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/akama_jirou.jpg"],
    },
    {
      id: 9890071,
      name: "黄川田 仁志",
      group: "内閣府特命担当大臣（沖縄及び北方対策 消費者及び食品安全 こども政策 少子化対策 若者活躍 男女共同参画 地方創生 アイヌ施策 共生・共助） / 女性活躍担当 / 共生社会担当 / 地域未来戦略担当 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/kikawada_hitoshi.jpg"],
    },
    {
      id: 9282736,
      name: "城内 実",
      group: "日本成長戦略担当 / 賃上げ環境整備担当 / スタートアップ担当 / 全世代型社会保障改革担当 / 感染症危機管理担当 / 内閣府特命担当大臣（経済財政政策 規制改革） / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/kiuchi_minoru.jpg"],
    },
    {
      id: 9804597,
      name: "小野田 紀美",
      group: "経済安全保障担当 / 外国人との秩序ある共生社会推進担当 / 内閣府特命担当大臣（クールジャパン戦略 知的財産戦略 科学技術政策 宇宙政策 人工知能戦略 経済安全保障） / 参議院",
      images: ["https://www.kantei.go.jp/jp/content/onoda_kimi.jpg"],
    },
    {
      id: 9124167,
      name: "尾﨑 正直",
      group: "内閣官房副長官 / 衆議院",
      images: ["https://www.kantei.go.jp/jp/content/ozaki_masanao.jpg"],
    },
    {
      id: 9754376,
      name: "佐藤 啓",
      group: "内閣官房副長官 / 参議院",
      images: ["https://www.kantei.go.jp/jp/content/satou_kei2.jpg"],
    },
    {
      id: 9248904,
      name: "露木 康浩",
      group: "内閣官房副長官",
      images: ["https://www.kantei.go.jp/jp/content/tsuyuki_yasuhiro.jpg"],
    },
    {
      id: 9204210,
      name: "岩尾 信行",
      group: "内閣法制局長官",
      images: ["https://www.kantei.go.jp/jp/content/iwao_nobuyuki.jpg"],
    },
  ];
}

async function main() {
  let currentHtml = "";
  try {
    currentHtml = await fetchText(CURRENT_MEIBO_URL);
  } catch {
    const fallback = defaultCurrentData();
    fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
    fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(fallback, null, 2)}\n`, "utf8");
    console.log(`ministers.json generated from fallback (${fallback.length})`);
    return;
  }

  const { anchors, lines } = buildTokenizedLines(currentHtml, CURRENT_MEIBO_URL);
  const rawEntries = parseEntriesFromLines(lines, anchors);
  if (!rawEntries.length) {
    throw new Error("Could not parse current minister entries");
  }

  const out = [];
  for (const rawEntry of rawEntries) {
    let name = rawEntry.name;
    let role = rawEntry.role;
    let imageUrl = "";

    if (rawEntry.profileUrl) {
      try {
        const profileHtml = await fetchText(rawEntry.profileUrl);
        const profile = extractProfileData(profileHtml, rawEntry.profileUrl);
        if (!name && profile.name) name = profile.name;
        if (!role && profile.role) role = profile.role;
        if (profile.imageUrl) imageUrl = profile.imageUrl;
      } catch {
        // continue to fallback below
      }
    }

    if (!imageUrl && name) {
      imageUrl = await resolveFallbackImage(name);
    }

    const group = [role, rawEntry.chamber].filter(Boolean).join(" / ");
    if (!name || !group || !imageUrl) {
      throw new Error(`Incomplete minister entry: name=${name} group=${group} image=${imageUrl}`);
    }

    out.push({
      id: stableIdFromName(name),
      name,
      group,
      images: [imageUrl],
    });
  }

  out.sort((a, b) => a.id - b.id);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`ministers.json generated (${out.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
