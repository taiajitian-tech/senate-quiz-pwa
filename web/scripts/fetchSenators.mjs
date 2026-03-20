import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const OUTPUT_PATH = path.resolve(__dirname, "../public/data/senators.json");

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

function normalizeDistrict(text) {
  const value = normText(text);
  if (!value) return "";
  if (value.includes("比例")) return "比例";
  return value.replace(/選出$/u, "").replace(/選挙区$/u, "").trim();
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
  return splitNameAndKana(rawName).name
    .replace(/\s*\[[^\]]+\]\s*/gu, "")
    .replace(/\s*＜正字＞\s*/gu, "")
    .trim();
}

function toGregorianYear(text) {
  const value = normText(text);
  const reiwa = value.match(/令和\s*(\d+)\s*年/u);
  if (reiwa) return 2018 + Number(reiwa[1]);
  const western = value.match(/(20\d{2})\s*年/u);
  if (western) return Number(western[1]);
  return undefined;
}

function parseListRowsFromLinks(listHtml, listUrl) {
  const $ = cheerio.load(listHtml);
  const infoMap = new Map();

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (!/\/profile\/\d+\.htm/i.test(href)) return;

    const profileUrl = absUrl(listUrl, href).replace(/\?.*$/, "");
    if (!profileUrl) return;

    const rawName = normText($(a).text());
    if (!rawName) return;

    const parentText = normText($(a).parent().text()) || normText($(a).closest("li, td, p, div").text());
    const rowText = parentText
      .replace(/\s*＜正字＞.*/u, "")
      .replace(/\s*\[[^\]]+\]/gu, "")
      .trim();

    const nameOnly = normalizeNameForMatch(rawName);
    let trailing = rowText;
    if (trailing.startsWith(nameOnly)) {
      trailing = normText(trailing.slice(nameOnly.length));
    }

    const m = trailing.match(/^(.+?)\s+([^\s]+)\s+([^\s]+)\s+(令和\d+年\d+月\d+日|20\d{2}年\d+月\d+日)$/u);
    if (!m) return;

    const kana = normalizeCompact(m[1]);
    const shortGroup = normText(m[2]);
    const district = normalizeDistrict(m[3]);
    const termEnd = normText(m[4]);

    infoMap.set(profileUrl, {
      name: nameOnly,
      kana,
      shortGroup,
      district,
      termEnd,
      nextElectionYear: toGregorianYear(termEnd),
    });
  });

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
    const re = new RegExp(`${label}\\s*[：:]?\\s*([^\\n\\r]{1,120})`);
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
  if (s === "自民") return "自由民主党・無所属の会";
  if (s === "立憲") return "立憲民主・社民・無所属";
  if (s === "民主") return "国民民主党・新緑風会";
  if (s === "公明") return "公明党";
  if (s === "維新") return "日本維新の会";
  if (s === "共産") return "日本共産党";
  if (s === "れ新") return "れいわ新選組";
  if (s === "参政") return "参政党";
  if (s === "保守") return "日本保守党";
  if (s === "みら") return "みらい";
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

function extractProfileElectionInfo($) {
  const combined = scanByLabel($, ["選挙区・比例区／当選年／当選回数", "選挙区・比例区/当選年/当選回数"]);
  if (combined) {
    const parts = combined.split(/[／/]/u).map((v) => normText(v)).filter(Boolean);
    const district = normalizeDistrict(parts[0] ?? "");
    const termsMatch = combined.match(/当選\s*(\d+)\s*回/u);
    const terms = termsMatch ? Number(termsMatch[1]) : undefined;
    return { district, terms };
  }

  const districtRaw = scanByLabel($, ["選挙区", "選挙区・比例区"]);
  const district = normalizeDistrict(districtRaw);
  const termsRaw = scanByLabel($, ["当選回数"]);
  const termsMatch = termsRaw.match(/(\d+)/u);
  const terms = termsMatch ? Number(termsMatch[1]) : undefined;

  return { district, terms };
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

  const listInfoMap = parseListRowsFromLinks(listHtml, listUrl);
  console.log("list row info extracted:", listInfoMap.size);

  const senators = [];
  let districtCount = 0;
  let termsCount = 0;
  let nextElectionYearCount = 0;

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
      const party = group;
      const { district, terms } = extractProfileElectionInfo($);
      const photoUrl = extractPhoto(profileUrl, idStr, $);
      const termEndRaw = scanByLabel($, ["任期満了日"]);
      const bodyText = normText($("body").text());
      const nextElectionYear = (() => {
        const direct = toGregorianYear(termEndRaw);
        if (typeof direct === "number") return direct;

        const reiwa = bodyText.match(/任期満了日[^\n\r]*?令和\s*(\d+)\s*年/u);
        if (reiwa) return 2018 + Number(reiwa[1]);

        const western = bodyText.match(/任期満了日[^\n\r]*?(20\d{2})\s*年/u);
        if (western) return Number(western[1]);

        return listInfo?.nextElectionYear;
      })();

      if (district || listInfo?.district) districtCount += 1;
      if (typeof terms === "number") termsCount += 1;
      if (typeof nextElectionYear === "number") nextElectionYearCount += 1;

      senators.push({
        id,
        name,
        group,
        party,
        district: district || listInfo?.district || undefined,
        terms,
        nextElectionYear,
        images: photoUrl ? [photoUrl] : [],
      });
    } catch (e) {
      console.log("SKIP:", profileUrl, String(e));
    }
  }

  console.log("district extracted:", districtCount);
  console.log("terms extracted:", termsCount);
  console.log("nextElectionYear extracted:", nextElectionYearCount);
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
