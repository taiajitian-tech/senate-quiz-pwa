import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

// UA を固定（ブロック回避の保険）
const UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36";

function absUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return "";
  }
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": UA,
      accept: "text/html,application/xhtml+xml",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

// current/ が「中継HTML」になった場合、HTML内の実体URLを拾って追従
function resolveRealListUrl(entryHtml, entryUrl, finalUrl) {
  if (finalUrl && finalUrl !== entryUrl) return finalUrl;

  const m =
    entryHtml.match(/\/japanese\/joho1\/kousei\/giin\/\d+\/giin\.htm/i) ||
    entryHtml.match(/\/kousei\/giin\/\d+\/giin\.htm/i);

  if (m?.[0]) return absUrl(entryUrl, m[0]);

  return entryUrl;
}

function normText(s) {
  return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeCompact(s) {
  return normText(s).replace(/[\s\u3000]+/g, "");
}

function extractProfileLinks(listHtml, listUrl) {
  const $ = cheerio.load(listHtml);
  const set = new Set();

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/profile\/\d+\.htm/i.test(href)) return;
    const u = absUrl(listUrl, href);
    if (!u) return;
    if (!u.startsWith("https://www.sangiin.go.jp/")) return;
    set.add(u.replace(/\?.*$/, ""));
  });

  return Array.from(set);
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? m[1] : "";
}

function splitNameAndKana(rawName) {
  const text = normText(rawName);
  const match = text.match(/^(.*?)（([^）]+)）$/u) ?? text.match(/^(.*?)\(([^)]+)\)$/u);
  if (!match) {
    return { name: text, kana: "" };
  }
  return {
    name: normText(match[1]),
    kana: normalizeCompact(match[2]),
  };
}

function normalizeNameForMatch(rawName) {
  return splitNameAndKana(rawName).name;
}

function toGregorianYear(text) {
  const value = normText(text);
  const reiwa = value.match(/令和\s*(\d+)\s*年/u);
  if (reiwa) return 2018 + Number(reiwa[1]);
  const western = value.match(/(20\d{2})\s*年/u);
  if (western) return Number(western[1]);
  return undefined;
}

function parseListRowInfo(listHtml, listUrl) {
  const $ = cheerio.load(listHtml);
  const infoMap = new Map();

  const commit = (profileUrl, rawName, rawGroup, rawTermEnd) => {
    if (!profileUrl) return;
    const cleanUrl = profileUrl.replace(/\?.*$/, "");
    const name = normalizeNameForMatch(rawName);
    const group = normText(rawGroup);
    const termEnd = normText(rawTermEnd);
    const nextElectionYear = toGregorianYear(termEnd);
    if (!name) return;

    infoMap.set(cleanUrl, {
      name,
      shortGroup: group,
      termEnd,
      nextElectionYear,
    });
  };

  $("tr").each((_, tr) => {
    const cells = $(tr).find("th, td");
    if (cells.length < 4) return;
    const firstLink = $(cells.get(0)).find('a[href*="/profile/"]').first();
    if (!firstLink.length) return;

    const profileUrl = absUrl(listUrl, firstLink.attr("href") || "");
    const rawName = normText(firstLink.text() || $(cells.get(0)).text());
    const rawGroup = normText($(cells.get(2)).text());
    const rawTermEnd = normText($(cells.get(cells.length - 1)).text());
    commit(profileUrl, rawName, rawGroup, rawTermEnd);
  });

  if (infoMap.size) return infoMap;

  // DOM 構造が変わった場合の保険: 本文テキストを1行ずつ走査
  const bodyLines = $("body")
    .text()
    .split(/\r?\n/u)
    .map((line) => normText(line))
    .filter(Boolean);

  const profileLinks = extractProfileLinks(listHtml, listUrl);
  const urlById = new Map(profileLinks.map((url) => [extractIdFromProfileUrl(url), url]));

  for (const line of bodyLines) {
    const m = line.match(/^(.*?)\s+([^\s]+)\s+([^\s]+)\s+([^\s]+)\s+(令和\d+年\d+月\d+日|20\d{2}年\d+月\d+日)$/u);
    if (!m) continue;
    const rawName = m[1];
    const group = m[3];
    const termEnd = m[4];
    const cleanName = normalizeNameForMatch(rawName);

    for (const [id, profileUrl] of urlById.entries()) {
      if (!id) continue;
      if (!profileUrl) continue;
      if (infoMap.has(profileUrl)) continue;
      if (cleanName === normalizeNameForMatch(rawName)) {
        commit(profileUrl, rawName, group, termEnd);
      }
    }
  }

  return infoMap;
}

function scanByLabel($, labelVariants) {
  const labels = Array.isArray(labelVariants) ? labelVariants : [labelVariants];

  for (const label of labels) {
    const th = $(`th:contains("${label}")`).first();
    if (th.length) {
      const td = th.next("td");
      const v = normText(td.text());
      if (v) return v;
    }
  }

  for (const label of labels) {
    const dt = $(`dt:contains("${label}")`).first();
    if (dt.length) {
      const dd = dt.next("dd");
      const v = normText(dd.text());
      if (v) return v;
    }
  }

  const body = normText($("body").text());
  for (const label of labels) {
    const re = new RegExp(`${label}\\s*[：:]\\s*([^\\n\\r]{1,80})`);
    const m = body.match(re);
    if (m?.[1]) {
      const v = normText(m[1]);
      if (v) return v;
    }
  }

  return "";
}

function looksLikeGroup(v) {
  const s = normText(v);
  if (!s) return false;
  if (s.length <= 4 && !/(党|会|無所属|クラブ|沖縄)/.test(s)) return false;
  return true;
}

function expandGroupShortName(v) {
  const s = normText(v);
  if (s === "沖縄") return "沖縄の風";
  return s;
}

function extractName($) {
  const h1 = normText($("h1").first().text());
  if (h1) return h1.replace(/：?参議院$/g, "").trim();

  const t = normText($("title").text());
  if (t) return t.replace(/｜.*$/g, "").replace(/:\s*参議院.*$/g, "").replace(/：?参議院$/g, "").trim();

  return "";
}

function extractGroup($, listInfo) {
  const fromProfile = scanByLabel($, ["所属会派", "会派"]);
  if (looksLikeGroup(fromProfile)) return fromProfile;
  const fromList = expandGroupShortName(listInfo?.shortGroup ?? "");
  if (looksLikeGroup(fromList)) return fromList;
  return "";
}

function normalizeDistrict(value) {
  const s = normText(value);
  if (!s) return "";
  if (/比例代表/.test(s)) return "比例代表";
  return s.replace(/選挙区$/u, "").trim() || s;
}

function extractDistrict($) {
  const value = scanByLabel($, ["選挙区", "選出選挙区"]);
  return normalizeDistrict(value);
}

function extractTerms($) {
  const value = scanByLabel($, ["当選回数", "当選"]);
  const digits = value.replace(/[^0-9０-９]/g, "");
  if (!digits) return undefined;
  const normalized = digits.replace(/[０-９]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  const n = Number(normalized);
  return Number.isFinite(n) ? n : undefined;
}

function extractParty($) {
  const value = scanByLabel($, ["所属党派", "党派", "政党"]);
  return normText(value);
}

function extractPhoto(profileUrl, id, $) {
  if (id) {
    return `https://www.sangiin.go.jp/japanese/joho1/kousei/giin/photo/g${id}.jpg`;
  }

  const og = $('meta[property="og:image"]').attr("content");
  if (og) {
    const u = absUrl(profileUrl, og);
    if (u) return u;
  }

  const img = $("img[src$='.jpg'], img[src$='.JPG']").first().attr("src");
  if (img) {
    const u = absUrl(profileUrl, img);
    if (u) return u;
  }

  return "";
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const entry = await fetchText(ENTRY_URL);
  let listUrl = resolveRealListUrl(entry.html, ENTRY_URL, entry.finalUrl);
  let listHtml = entry.html;

  if (listUrl !== ENTRY_URL) {
    const real = await fetchText(listUrl);
    listHtml = real.html;
    listUrl = real.finalUrl || listUrl;
  }

  const links = extractProfileLinks(listHtml, listUrl);
  console.log("profile links extracted:", links.length);
  if (!links.length) {
    console.error("Error: profile link list is empty (0).");
    process.exit(1);
  }

  const listInfoMap = parseListRowInfo(listHtml, listUrl);
  console.log("list row info extracted:", listInfoMap.size);

  const senators = [];
  for (const profileUrl of links) {
    try {
      const { html } = await fetchText(profileUrl);
      const $ = cheerio.load(html);

      const idStr = extractIdFromProfileUrl(profileUrl);
      const id = idStr ? Number(idStr) : NaN;

      const name = extractName($);
      if (!name || !Number.isFinite(id)) {
        console.log("SKIP:", profileUrl, "(missing id/name)");
        continue;
      }

      const listInfo = listInfoMap.get(profileUrl);
      const group = extractGroup($, listInfo);
      const party = extractParty($) || group;
      const district = extractDistrict($);
      const terms = extractTerms($);
      const photoUrl = extractPhoto(profileUrl, idStr, $);

      senators.push({
        id,
        name,
        group,
        party,
        district,
        terms,
        nextElectionYear: listInfo?.nextElectionYear,
        images: photoUrl ? [photoUrl] : [],
      });
    } catch (e) {
      console.log("SKIP:", profileUrl, String(e));
    }
  }

  console.log("parsed senators:", senators.length);
  if (!senators.length) {
    console.error("Error: parsed senators is empty (0).");
    process.exit(1);
  }

  senators.sort((a, b) => a.id - b.id);
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(senators, null, 2) + "\n", "utf-8");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
