import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ENTRY_URL =
  "https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/giin.htm";

const CWD = process.cwd();
// Actions では working-directory: web を使うため、まず web/ 配下を優先。
// ローカル実行などで repo ルートから起動した場合も壊れないように分岐。
const OUTPUT_PATH = CWD.endsWith(`${path.sep}web`)
  ? path.resolve(CWD, "public/data/senators.json")
  : path.resolve(CWD, "web/public/data/senators.json");

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchText(url, { maxRetries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          "user-agent": UA,
          accept: "text/html,application/xhtml+xml",
        },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);

      const html = await res.text();
      return { html, finalUrl: res.url || url };
    } catch (e) {
      lastErr = e;
      // 429/一時障害想定：指数バックオフ
      if (attempt < maxRetries) {
        const wait = 500 * Math.pow(2, attempt);
        await sleep(wait);
      }
    } finally {
      clearTimeout(t);
    }
  }
  throw lastErr;
}

function normText(s) {
  return (s || "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function extractIdFromProfileUrl(profileUrl) {
  const m = profileUrl.match(/\/profile\/(\d+)\.htm$/);
  return m ? m[1] : "";
}

function extractProfileLinks(html, baseUrl) {
  const $ = cheerio.load(html);
  const set = new Set();

  // DEBUG: profile を含む href を少しだけ出す（取得0件原因の特定用）
  let debugShown = 0;

  $("a[href]").each((_, a) => {
    const href = $(a).attr("href") || "";
    if (debugShown < 5 && /profile\//i.test(href)) {
      console.log("  href contains profile:", href);
      debugShown++;
    }
    if (!/(?:^|\/)?profile\/\d+\.htm/i.test(href)) return;
    const u = absUrl(baseUrl, href);
    if (!u) return;
    if (!u.startsWith("https://www.sangiin.go.jp/")) return;
    set.add(u.replace(/\?.*$/, ""));
  });

  return Array.from(set);
}

// 「入口 →（複数ページ）→ profileリンクが並ぶページ」に到達するまで、制御付きで辿る
async function discoverProfileLinks(startUrl) {
  const visited = new Set();
  const queue = [{ url: startUrl, depth: 0 }];

  const MAX_DEPTH = 4;       // 深すぎる巡回を防ぐ
  const MAX_PAGES = 30;      // 過剰アクセス防止
  const ALLOW_RE = /\/japanese\/joho1\/kousei\/giin\//i;

  let pagesFetched = 0;

  while (queue.length && pagesFetched < MAX_PAGES) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const { html, finalUrl } = await fetchText(url);
    pagesFetched++;

    const base = finalUrl || url;

    const profiles = extractProfileLinks(html, base);
    console.log("scan page:", base, "profiles:", profiles.length, "depth:", depth, "queue:", queue.length);
    if (profiles.length) {
      return { profileLinks: profiles, pagesFetched };
    }

    if (depth >= MAX_DEPTH) continue;

    // 次ページ候補：同一ドメインかつ /kousei/giin/ 配下
    const $ = cheerio.load(html);
    $("a[href]").each((_, a) => {
      const href = $(a).attr("href") || "";
      if (!href) return;

      const next = absUrl(base, href).replace(/\?.*$/, "");
      if (!next) return;
      if (!next.startsWith("https://www.sangiin.go.jp/")) return;
      if (!ALLOW_RE.test(next)) return;

      // profile は上で拾う。ここは中継ページ候補のみ
      if (/\/profile\/\d+\.htm$/i.test(next)) return;

      // HTML以外は除外
      if (!/(\.htm|\.html|\/)$/i.test(next)) return;

      queue.push({ url: next, depth: depth + 1 });
    });
  }

  return { profileLinks: [], pagesFetched };
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
  if (s.length <= 4 && !/(党|会|無所属|クラブ)/.test(s)) return false;
  return true;
}

function extractName($) {
  const h1 = normText($("h1").first().text());
  if (h1) return h1;

  const t = normText($("title").text());
  if (t) return t.replace(/｜.*$/g, "").replace(/:\s*参議院.*$/g, "").trim();

  return "";
}

function extractGroup($) {
  const v = scanByLabel($, ["所属会派", "会派"]);
  if (looksLikeGroup(v)) return v;
  return "";
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

function writeJsonAtomic(targetPath, data) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });

  const tmp = `${targetPath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  fs.renameSync(tmp, targetPath);
}

async function main() {
  console.log("ENTRY_URL:", ENTRY_URL);

  const { profileLinks, pagesFetched } = await discoverProfileLinks(ENTRY_URL);

  console.log("pages fetched:", pagesFetched);
  console.log("profile links extracted:", profileLinks.length);

  if (!profileLinks.length) {
    console.error("ERROR: profile link list is empty (0). Stop without updating JSON.");
    process.exit(1);
  }

  const senators = [];
  for (const profileUrl of profileLinks) {
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

      const group = extractGroup($);
      const photoUrl = extractPhoto(profileUrl, idStr, $);

      senators.push({
        id,
        name,
        group,
        images: photoUrl ? [photoUrl] : [],
      });
    } catch (e) {
      console.log("SKIP:", profileUrl, String(e));
    }
  }

  console.log("parsed senators:", senators.length);

  if (senators.length < 1) {
    console.error("ERROR: parsed senators is 0. Stop without updating JSON.");
    process.exit(1);
  }

  senators.sort((a, b) => a.id - b.id);
  if (!Array.isArray(senators) || senators.length < 1) {
    console.error("ERROR: senators array is empty; aborting.");
    process.exit(1);
  }
  writeJsonAtomic(OUTPUT_PATH, senators);
  console.log("OUTPUT_PATH:", OUTPUT_PATH);
  try { const st = fs.statSync(OUTPUT_PATH); console.log("OUTPUT_SIZE:", st.size); } catch (e) { console.log("OUTPUT_STAT_ERROR:", String(e)); }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
