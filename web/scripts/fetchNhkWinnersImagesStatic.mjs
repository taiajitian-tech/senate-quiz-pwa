
import fs from "node:fs";
import path from "node:path";

const DATA_PATH = path.resolve("public/data/representatives.json");
const FIX_TARGETS_PATH = path.resolve("public/data/representatives-image-fix-targets.json");
const TARGET_MODE = String(process.env.REP_IMAGE_TARGET_MODE || "missing").trim().toLowerCase();

const ORIGIN = "https://news.web.nhk";
const NHK_SEED_URLS = [
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_senkyoku.html`,
  `${ORIGIN}/senkyo/database/shugiin/00/tousen_toukaku_hirei.html`,
];

function normalizeSpace(value = "") {
  return String(value).replace(/\s+/g, " ").trim();
}

function cleanName(value = "") {
  return normalizeSpace(String(value))
    .replace(/[ 　\t\r\n]/g, "")
    .replace(/君$/u, "")
    .replace(/[()（）「」『』・･.\-ー]/g, "");
}

function normalizeUrl(url = "", base = "") {
  const raw = String(url || "").trim().replace(/&amp;/g, "&");
  if (!raw || /^data:/i.test(raw) || /^javascript:/i.test(raw) || /^mailto:/i.test(raw)) return "";
  try {
    const parsed = new URL(raw, base || undefined);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return "";
  }
}

function looksLikeNhk(url = "") {
  return /^https:\/\/news\.web\.nhk\/senkyo\//i.test(url);
}

function looksLikeImageUrl(value = "") {
  return /^https?:\/\//i.test(value) && /(\.jpg|\.jpeg|\.png|\.webp)(\?|$)/i.test(value);
}

function loadFixTargetSet() {
  if (!fs.existsSync(FIX_TARGETS_PATH)) return new Set();
  try {
    const items = JSON.parse(fs.readFileSync(FIX_TARGETS_PATH, "utf8"));
    return new Set((Array.isArray(items) ? items : []).map((item) => cleanName(item?.name || "")));
  } catch {
    return new Set();
  }
}

function shouldProcessMember(member, fixSet) {
  const hasImage = Boolean(normalizeSpace(member?.image || ""));
  if (TARGET_MODE === "all") return true;
  if (TARGET_MODE === "fix") return fixSet.has(cleanName(member?.name || ""));
  return !hasImage;
}

function markResolved(member, found) {
  member.image = found.url;
  member.imageSource = found.source || "nhk-static";
  member.imageSourceUrl = found.sourceUrl || found.url;
  member.aiGuess = false;
  member.sourceType = "verified";
  member.imageMaskBottom = false;
  member.imageMaskMode = "none";
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "accept": "text/html,application/json,text/javascript,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function extractAppData(html = "") {
  const m = html.match(/window\.App_SenkyoData\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch {
    return {};
  }
}

function extractScriptSrcs(html = "", baseUrl = "") {
  const out = [];
  const re = /<script[^>]+src=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = normalizeUrl(m[1], baseUrl);
    if (url) out.push(url);
  }
  return [...new Set(out)];
}

function extractAnchorUrls(html = "", baseUrl = "") {
  const out = [];
  const re = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const url = normalizeUrl(m[1], baseUrl);
    if (url) out.push(url);
  }
  return [...new Set(out)];
}

function extractQuotedCandidates(text = "", baseUrl = "", appData = {}) {
  const out = new Set();
  const add = (value) => {
    if (!value) return;
    let s = String(value).trim();
    if (!s) return;

    // basic template substitution
    for (const [k, v] of Object.entries(appData || {})) {
      s = s.replaceAll(`\${${k}}`, String(v ?? ""));
      s = s.replaceAll(`{{${k}}}`, String(v ?? ""));
      s = s.replaceAll(`:${k}`, String(v ?? ""));
    }

    const url = normalizeUrl(s, baseUrl);
    if (!url) return;
    if (!looksLikeNhk(url)) return;
    if (!/(\.json|\.js|\.html|\/\d{2,}\/?$)/i.test(url)) return;
    out.add(url);
  };

  const quoteRe = /["'`]([^"'`]+(?:\.json|\.js|\.html|\/\d{2,}\/?)[^"'`]*)["'`]/g;
  let m;
  while ((m = quoteRe.exec(text))) add(m[1]);

  // concatenated path fragments commonly used in JS
  const pathRe = /(\/senkyo[-\w\/.]*?(?:json|js|html)[^"'`\s)]*)/gi;
  while ((m = pathRe.exec(text))) add(m[1]);

  return [...out];
}

function collectCardsFromHtml(html = "", sourceUrl = "", targetNames = []) {
  const cards = [];
  const imgRe = /<img\b[^>]*>/gi;
  let m;
  while ((m = imgRe.exec(html))) {
    const tag = m[0];
    const attrs = {};
    for (const a of tag.matchAll(/([^\s=]+)=["']([^"']*)["']/g)) attrs[a[1]] = a[2];
    const vals = [attrs.src, attrs["data-src"], attrs["data-original"], attrs["data-lazy-src"], attrs.srcset, attrs["data-srcset"], attrs["data-lazy-srcset"]];
    let imgUrl = "";
    for (const v of vals) {
      const raw = String(v || "").trim();
      if (!raw) continue;
      const first = raw.split(",")[0]?.trim().split(/\s+/)[0]?.trim();
      const u = normalizeUrl(first, sourceUrl);
      if (u && looksLikeImageUrl(u)) {
        imgUrl = u;
        break;
      }
    }
    if (!imgUrl) continue;

    const windowStart = Math.max(0, m.index - 1500);
    const windowEnd = Math.min(html.length, m.index + tag.length + 1500);
    const nearby = html.slice(windowStart, windowEnd)
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ");
    const hay = cleanName(nearby);

    const matches = targetNames.filter((item) => hay.includes(item.clean));
    if (matches.length !== 1) continue;

    cards.push({
      name: matches[0].raw,
      clean: matches[0].clean,
      url: imgUrl,
      source: "nhk-static-html",
      sourceUrl,
      width: 0,
      height: 0,
      text: nearby,
    });
  }
  return cards;
}

function collectJsonCandidates(root, pageUrl, targetNames, out = []) {
  const walk = (node) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    const entries = Object.entries(node);
    const stringValues = entries
      .filter(([, value]) => typeof value === "string")
      .map(([key, value]) => [key, normalizeSpace(value)]);

    const joined = cleanName(stringValues.map(([, value]) => value).join(" "));
    const imageCandidates = stringValues
      .map(([, value]) => normalizeUrl(value, pageUrl))
      .filter((value) => looksLikeImageUrl(value));

    if (joined && imageCandidates.length) {
      const matches = targetNames.filter((item) => joined.includes(item.clean));
      if (matches.length === 1) {
        out.push({
          name: matches[0].raw,
          clean: matches[0].clean,
          url: imageCandidates[0],
          source: "nhk-static-json",
          sourceUrl: pageUrl,
          width: Number(node.width || node.img_width || node.image_width || 0),
          height: Number(node.height || node.img_height || node.image_height || 0),
          text: stringValues.map(([key, value]) => `${key}:${value}`).join(" "),
        });
      }
    }

    for (const [, value] of entries) {
      if (typeof value === "object" && value !== null) walk(value);
    }
  };
  walk(root);
  return out;
}

function tryParseJsonish(text = "") {
  try {
    return JSON.parse(text);
  } catch {}

  const assign = text.match(/^\s*(?:window\.[A-Za-z0-9_$.]+\s*=\s*)?(\{[\s\S]*\}|\[[\s\S]*\])\s*;?\s*$/);
  if (assign) {
    try {
      return JSON.parse(assign[1]);
    } catch {}
  }
  return null;
}

function chooseBest(cards) {
  const byName = new Map();
  for (const card of cards) {
    let score = 0;
    if ((card.width || 0) >= 160) score += 8;
    if ((card.height || 0) >= 160) score += 8;
    if (/比例|小選挙区|当選|当確|自民|維新|国民|共産|参政|みらい|中道/u.test(card.text || "")) score += 4;
    if (/static-json/.test(card.source || "")) score += 3;
    if (/static-html/.test(card.source || "")) score += 2;

    const current = byName.get(card.clean);
    if (!current || score > current.score) byName.set(card.clean, { ...card, score });
  }
  return byName;
}

async function crawlNhkStatic(targetNames) {
  const visited = new Set();
  const queued = new Set(NHK_SEED_URLS);
  const queue = [...NHK_SEED_URLS];
  const cards = [];

  while (queue.length) {
    const url = queue.shift();
    queued.delete(url);
    if (!url || visited.has(url) || !looksLikeNhk(url)) continue;
    visited.add(url);

    try {
      const text = await fetchText(url);
      console.log(`nhk-static: page=${url} bytes=${text.length}`);

      // page HTML itself
      cards.push(...collectCardsFromHtml(text, url, targetNames));

      const appData = extractAppData(text);
      const nextAnchors = extractAnchorUrls(text, url).filter((u) => looksLikeNhk(u) && (/\.html$/i.test(u) || /\/\d{2,}\/?$/.test(u)));
      for (const next of nextAnchors) {
        if (!visited.has(next) && !queued.has(next)) {
          queue.push(next);
          queued.add(next);
        }
      }

      const scriptUrls = extractScriptSrcs(text, url);
      const allCandidates = new Set(nextAnchors);
      for (const s of scriptUrls) {
        allCandidates.add(s);
        try {
          const js = await fetchText(s);
          for (const found of extractQuotedCandidates(js, s, appData)) allCandidates.add(found);
        } catch (error) {
          console.log(`nhk-static: script-failed url=${s} reason=${error?.message || "unknown"}`);
        }
      }

      for (const candidate of allCandidates) {
        if (!looksLikeNhk(candidate) || visited.has(candidate)) continue;
        if (!/(\.json|\.js|\.html|\/\d{2,}\/?$)/i.test(candidate)) continue;

        try {
          const payload = await fetchText(candidate);
          const parsed = tryParseJsonish(payload);
          if (parsed) {
            const found = collectJsonCandidates(parsed, candidate, targetNames, []);
            if (found.length) {
              cards.push(...found);
              console.log(`nhk-static: json=${candidate} matched=${found.length}`);
            }
          } else if (/\.html?$/i.test(candidate) || /<html|<div|<img/i.test(payload)) {
            const found = collectCardsFromHtml(payload, candidate, targetNames);
            if (found.length) {
              cards.push(...found);
              console.log(`nhk-static: html=${candidate} matched=${found.length}`);
            }
            // also queue linked pages under NHK election DB
            for (const next of extractAnchorUrls(payload, candidate)) {
              if (looksLikeNhk(next) && !visited.has(next) && !queued.has(next) && (/\.html$/i.test(next) || /\/\d{2,}\/?$/.test(next))) {
                queue.push(next);
                queued.add(next);
              }
            }
          }
        } catch (error) {
          console.log(`nhk-static: candidate-failed url=${candidate} reason=${error?.message || "unknown"}`);
        }
      }
    } catch (error) {
      console.log(`nhk-static: fetch-failed url=${url} reason=${error?.message || "unknown"}`);
    }
  }

  return { visitedPages: visited.size, cards };
}

async function main() {
  const members = JSON.parse(fs.readFileSync(DATA_PATH, "utf8"));
  const fixSet = loadFixTargetSet();
  const targets = members.filter((member) => shouldProcessMember(member, fixSet));
  const targetNames = targets.map((member) => ({ raw: member.name, clean: cleanName(member.name) })).filter((x) => x.clean);

  console.log(`nhk-static:v1 mode=${TARGET_MODE} total=${members.length} targets=${targets.length}`);

  if (!targets.length) {
    console.log("nhk-static:v1 nothing-to-process");
    return;
  }

  const { visitedPages, cards } = await crawlNhkStatic(targetNames);
  console.log(`nhk-static: visited-pages=${visitedPages}`);
  console.log(`nhk-static: raw-cards=${cards.length}`);

  if (visitedPages === 0 || cards.length === 0) {
    throw new Error(`NHK static scrape failed: visitedPages=${visitedPages} cards=${cards.length}`);
  }

  const best = chooseBest(cards);
  console.log(`nhk-static: matched-members=${best.size}`);

  let filled = 0;
  let stillMissing = 0;
  for (const member of targets) {
    const found = best.get(cleanName(member.name));
    if (found?.url) {
      markResolved(member, found);
      filled += 1;
      console.log(`filled: ${member.name} -> ${found.source}`);
    } else {
      stillMissing += 1;
      console.log(`missing: ${member.name}`);
    }
  }

  fs.writeFileSync(DATA_PATH, `${JSON.stringify(members, null, 2)}\n`, "utf8");
  console.log(`nhk-static:v1 complete mode=${TARGET_MODE} filled=${filled} still-missing=${stillMissing}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
