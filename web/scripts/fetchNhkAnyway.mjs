import fs from "node:fs";
import path from "node:path";
import * as cheerio from "cheerio";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const SEARCH_TARGETS_PATH = path.resolve("public/data/representatives-image-search-targets.json");
const MISSING_PATH = path.resolve("public/data/missing-images.json");

const PAGE_URLS = [];
for (let i = 0; i <= 99; i += 1) {
  const page = String(i).padStart(2, "0");
  PAGE_URLS.push(`https://news.web.nhk/senkyo/database/shugiin/${page}/tousen_toukaku_senkyoku.html`);
  PAGE_URLS.push(`https://news.web.nhk/senkyo/database/shugiin/${page}/tousen_toukaku_hirei.html`);
}
PAGE_URLS.push("https://www3.nhk.or.jp/news/special/election2024/");

const EXTRA_NAME_ALIASES = {
  "安藤たかお": ["安藤高夫"],
};

const FORCE_REPLACE = new Set([
  "浅田眞澄美",
  "石田真敏",
  "伊藤聡",
  "岩崎比菜",
  "上野宏史",
  "江藤拓",
  "長田紘一郎",
  "小里泰弘",
  "国光あやの",
  "今洋佑",
  "西條昌良",
  "斉藤りえ",
  "白坂亜紀",
  "鈴木拓海",
  "世古万美子",
  "俵田祐児",
  "辻由布子",
  "とかしきなおみ",
  "長野春信",
  "東田淳平",
  "藤沢忠盛",
  "藤田洋司",
  "文月涼",
  "古井康介",
  "前川恵",
  "三原朝利",
  "村木汀",
  "森原紀代子",
  "保岡宏武",
  "吉田有理",
  "米内紘正",
  "犬飼明佳",
  "大森江里子",
  "後藤祐一",
  "近藤和也",
  "重徳和彦",
  "中川宏昌",
  "沼崎満子",
  "野間健",
  "原田直樹",
  "平林晃",
  "福重隆浩",
  "山崎正恭",
  "早稲田ゆき",
  "青柳仁士",
  "池下卓",
  "池畑浩太朗",
  "一谷勇一郎",
  "うるま譲司",
  "奥下剛光",
  "柏倉祐司",
  "住吉寛紀",
  "高見亮",
  "西田薫",
  "萩原佳",
  "原山大亮",
  "三木圭恵",
  "美延映夫",
  "喜多義典",
  "若狹清史",
  "横田光弘",
  "井戸まさえ",
  "小竹凱",
  "河井昭成",
  "許斐亮太郎",
  "近藤雅彦",
  "佐々木真琴",
  "高沢一基",
  "鍋島勢理",
  "野村美穂",
  "福田徹",
  "向山好一",
  "青木ひとみ",
  "伊藤恵介",
  "川裕一郎",
  "木下敏之",
  "工藤聖子",
  "島村かおる",
  "鈴木美香",
  "なかやめぐ",
  "牧野俊一",
  "渡辺藍理",
  "宇佐美登",
  "河合道雄",
  "小林修平",
  "須田英太郎",
  "土橋章宏",
  "林拓海",
  "古川あおい",
  "峰島侑也",
  "武藤かず子",
  "山田瑛理",
  "緒方林太郎",
  "中村はやと",
  "山本ジョージ",
  "渡辺真太朗"
]);

function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function normalizeSpace(value = "") {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return normalizeSpace(String(value ?? ""))
    .normalize("NFKC")
    .replace(/[ \u3000\t\r\n]/g, "")
    .replace(/[()（）「」『』［］【】〔〕]/g, "")
    .replace(/[・･]/g, "")
    .replace(/[‐‑‒–—―ー－\-]/g, "")
    .replace(/君$/u, "")
    .trim();
}

function normalizeKana(value = "") {
  return cleanName(value).replace(/[\u30A1-\u30F6]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0x60),
  );
}

function normalizeUrl(url = "", base = "") {
  try {
    return new URL(String(url || "").trim().replace(/&amp;/g, "&"), base).toString();
  } catch {
    return "";
  }
}

function looksLikeImageUrl(url = "") {
  return /^https?:\/\//i.test(url) && /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(url);
}

function readTargets(members) {
  const fixTargets = readJsonIfExists(FIX_TARGETS_PATH, []);
  if (Array.isArray(fixTargets) && fixTargets.length > 0) {
    return {
      mode: "fix",
      names: [...new Set(fixTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  const searchTargets = readJsonIfExists(SEARCH_TARGETS_PATH, []);
  if (Array.isArray(searchTargets) && searchTargets.length > 0) {
    return {
      mode: "missing",
      names: [...new Set(searchTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  const missingTargets = readJsonIfExists(MISSING_PATH, []);
  if (Array.isArray(missingTargets) && missingTargets.length > 0) {
    return {
      mode: "missing",
      names: [...new Set(missingTargets.map((x) => cleanName(x?.name || "")).filter(Boolean))],
    };
  }

  return {
    mode: "missing",
    names: [...new Set(
      members
        .filter((m) => !normalizeSpace(m?.image || ""))
        .map((m) => cleanName(m?.name || ""))
        .filter(Boolean)
    )],
  };
}

function buildAliases(member) {
  const raw = new Set();
  const add = (value) => {
    const v = normalizeSpace(value || "");
    if (v) raw.add(v);
  };

  add(member?.name);
  add(member?.kana);
  add(member?.furigana);
  add(member?.yomi);
  add(member?.yomigana);
  for (const alias of EXTRA_NAME_ALIASES[normalizeSpace(member?.name || "")] || []) add(alias);

  const exact = new Set();
  const kana = new Set();

  for (const value of raw) {
    const c = cleanName(value);
    if (c) exact.add(c);
    const k = normalizeKana(value);
    if (k) kana.add(k);
  }

  return { exact, kana };
}

function buildTargetIndex(members, targetNames) {
  const targetSet = new Set(targetNames);
  const byExact = new Map();
  const byKana = new Map();
  const targetMembers = [];

  for (const member of members) {
    const memberName = cleanName(member?.name || "");
    const forced = FORCE_REPLACE.has(normalizeSpace(member?.name || ""));
    if (!forced && !targetSet.has(memberName)) continue;

    const aliases = buildAliases(member);
    const target = { member, memberName, aliases, forced };
    targetMembers.push(target);

    for (const key of aliases.exact) {
      if (!byExact.has(key)) byExact.set(key, []);
      byExact.get(key).push(target);
    }
    for (const key of aliases.kana) {
      if (!byKana.has(key)) byKana.set(key, []);
      byKana.get(key).push(target);
    }
  }

  return { targetSet, targetMembers, byExact, byKana };
}

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      accept: "text/html,*/*;q=0.8",
      "accept-language": "ja,en-US;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function collectNameCandidates($, block) {
  const texts = new Set();

  const push = (v) => {
    const raw = normalizeSpace(v || "");
    if (raw) texts.add(raw);
  };

  push(block.text());

  block.find("*").each((_, node) => {
    const el = $(node);
    push(el.attr("alt"));
    push(el.attr("title"));
    push(el.attr("aria-label"));
    push(el.text());
  });

  return [...texts];
}

function findSingleTargetFromNames(nameCandidates, indexes) {
  const matched = new Set();

  for (const value of nameCandidates) {
    const exact = cleanName(value);
    if (exact) {
      for (const item of indexes.byExact.get(exact) || []) matched.add(item);
    }
    const kana = normalizeKana(value);
    if (kana) {
      for (const item of indexes.byKana.get(kana) || []) matched.add(item);
    }
  }

  if (matched.size !== 1) return null;
  return [...matched][0];
}

function findImageInBlock($, block, pageUrl) {
  const images = [];

  block.find("img").each((_, img) => {
    const attrs = img.attribs || {};
    const srcCandidates = [
      attrs.src,
      attrs["data-src"],
      attrs["data-original"],
      attrs["data-lazy-src"],
      attrs.srcset ? attrs.srcset.split(",")[0]?.trim().split(/\s+/)[0] : "",
      attrs["data-srcset"] ? attrs["data-srcset"].split(",")[0]?.trim().split(/\s+/)[0] : "",
    ].filter(Boolean);

    for (const raw of srcCandidates) {
      const url = normalizeUrl(raw, pageUrl);
      if (!looksLikeImageUrl(url)) continue;

      const hay = `${url} ${attrs.alt || ""} ${attrs.class || ""} ${attrs.id || ""}`.toLowerCase();
      let score = 0;
      if (/photo|portrait|profile|member|candidate|win|face|kao/.test(hay)) score += 6;
      if (/logo|icon|banner|btn|button|sprite/.test(hay)) score -= 10;

      images.push({ url, score });
    }
  });

  return images.sort((a, b) => b.score - a.score)[0]?.url || "";
}

function collectMatchesFromPage(html, pageUrl, indexes) {
  const $ = cheerio.load(html);
  const matches = [];
  const selectors = [
    ".senkyoku-result__result-item",
    ".hirei-result__result-item",
    ".candidate",
    ".candidate_profile",
    "li",
    "article",
  ];

  const seen = new Set();

  for (const selector of selectors) {
    $(selector).each((_, node) => {
      const block = $(node);
      const textKey = cleanName(block.text()).slice(0, 120);
      if (!textKey) return;
      const key = `${selector}:${textKey}`;
      if (seen.has(key)) return;
      seen.add(key);

      const image = findImageInBlock($, block, pageUrl);
      if (!image) return;

      const nameCandidates = collectNameCandidates($, block);
      if (nameCandidates.length === 0) return;

      const target = findSingleTargetFromNames(nameCandidates, indexes);
      if (!target) return;

      matches.push({
        memberName: target.memberName,
        image,
        sourceUrl: pageUrl,
      });
    });
  }

  return matches;
}

async function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`representatives.json not found: ${DATA_PATH}`);
  }

  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const targetInfo = readTargets(members);
  const indexes = buildTargetIndex(members, targetInfo.names);

  console.log(`nhk-anyway mode=${targetInfo.mode} total=${members.length} targets=${indexes.targetMembers.length} force=${FORCE_REPLACE.size}`);

  const bestByName = new Map();

  for (const pageUrl of PAGE_URLS) {
    try {
      const html = await fetchHtml(pageUrl);
      const bytes = Buffer.byteLength(html, "utf8");
      const matches = collectMatchesFromPage(html, pageUrl, indexes);

      console.log(`nhk-anyway page=${pageUrl} bytes=${bytes} page-matches=${matches.length}`);

      for (const item of matches) {
        if (!bestByName.has(item.memberName)) bestByName.set(item.memberName, item);
      }
    } catch (error) {
      console.log(`nhk-anyway page-failed=${pageUrl} error=${error?.message ?? String(error)}`);
    }
  }

  let filled = 0;
  for (const target of indexes.targetMembers) {
    const found = bestByName.get(target.memberName);
    if (!found) continue;

    if (target.forced || !normalizeSpace(target.member?.image || "") || targetInfo.mode === "fix") {
      target.member.image = found.image;
      target.member.imageSource = "nhk";
      target.member.imageSourceUrl = found.sourceUrl;
      target.member.sourceType = "nhk-fixed";
      target.member.imageMaskBottom = false;
      target.member.imageMaskMode = "none";
      filled += 1;
      console.log(`replaced: ${target.member.name}`);
    }
  }

  fs.writeFileSync(DATA_PATH, JSON.stringify(members, null, 2));

  const stillMissing = [];
  for (const target of indexes.targetMembers) {
    if ((target.forced || targetInfo.mode === "fix") && !bestByName.has(target.memberName)) {
      stillMissing.push(target.member.name);
      console.log(`missing: ${target.member.name}`);
    }
  }

  console.log(`nhk-anyway complete filled=${filled} still-missing=${stillMissing.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
