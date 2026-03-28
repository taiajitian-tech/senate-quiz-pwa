import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { resolveKanteiMeiboUrls } from './kanteiMeibo.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../public/data');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const URLS = {
  councilorsOfficers: 'https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/yakuin.htm',
  houseOfficers: 'https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/officer.htm',
};

const MIN_COUNTS = {
  '参議院役員': 20,
  '衆議院役員': 10,
  '副大臣': 10,
  '大臣政務官': 10,
};

const ROLE_KEYWORDS = {
  '副大臣': ['副大臣', '内閣府副大臣', '復興副大臣'],
  '大臣政務官': ['大臣政務官', '内閣府大臣政務官'],
  '参議院役員': ['議長', '副議長', '委員長', '会長'],
  '衆議院役員': ['議長', '副議長', '委員長', '会長'],
};

const FALLBACK_HOUSE_OFFICERS = [
  ['議長', '森 英介', 'もり えいすけ'],
  ['副議長', '石井 啓一', 'いしい けいいち'],
  ['憲法審査会会長', '古屋 圭司', 'ふるや けいじ'],
  ['内閣委員長', '山下 貴司', 'やました たかし'],
  ['総務委員長', '古川 康', 'ふるかわ やすし'],
  ['法務委員長', '井上 英孝', 'いのうえ ひでたか'],
  ['外務委員長', '國場 幸之助', 'こくば こうのすけ'],
  ['財務金融委員長', '武村 展英', 'たけむら のぶひで'],
  ['文部科学委員長', '斎藤 洋明', 'さいとう ひろあき'],
  ['厚生労働委員長', '大串 正樹', 'おおぐし まさき'],
  ['農林水産委員長', '藤井 比早之', 'ふじい ひさゆき'],
  ['経済産業委員長', '工藤 彰三', 'くどう しょうぞう'],
  ['国土交通委員長', '冨樫 博之', 'とがし ひろゆき'],
  ['環境委員長', '宮路 拓馬', 'みやじ たくま'],
  ['安全保障委員長', '西村 明宏', 'にしむら あきひろ'],
  ['予算委員長', '坂本 哲志', 'さかもと てつし'],
  ['議院運営委員長', '山口 俊一', 'やまぐち しゅんいち'],
  ['沖縄及び北方問題に関する特別委員長', '島尻 安伊子', 'しまじり あいこ'],
  ['政治改革に関する特別委員長', '美延 映夫', 'みのべ てるお'],
  ['地域活性化・こども政策・デジタル社会形成に関する特別委員長', '丹羽 秀樹', 'にわ ひでき'],
  ['政治倫理審査会会長', '田中 和徳', 'たなか かずのり'],
].map(([subRole, name, kana]) => ({ subRole, name, kana }));

function readJson(fileName) {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, fileName), 'utf8'));
}

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(DATA_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

function readExistingArray(fileName) {
  try {
    const parsed = readJson(fileName);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function normalizeWhitespace(text) {
  return String(text ?? '').replace(/\u00a0/g, ' ').replace(/[\t\r]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeCompact(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/[\s\u3000]+/gu, '')
    .trim();
}

function normalizeKana(text) {
  return normalizeWhitespace(text).replace(/[\s\u3000]+/gu, '');
}

function toPlainName(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/君$/u, '')
    .trim();
}

function stableId(prefix, subRole, name) {
  const text = `${prefix}:${subRole}:${name}`;
  let hash = 0;
  for (const ch of text) hash = (hash * 131 + ch.codePointAt(0)) % 90000000;
  return 10000000 + hash;
}

function uniqueBy(list, getKey) {
  const out = [];
  const seen = new Set();
  for (const item of list) {
    const key = getKey(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function buildImageMap() {
  const byName = new Map();
  const byKanaChamber = new Map();

  const setUnique = (map, key, value) => {
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, value);
      return;
    }
    if (existing.name !== value.name || existing.image !== value.image || existing.chamber !== value.chamber) {
      map.set(key, null);
    }
  };

  const add = (rawName, kana, image, chamber, party) => {
    const cleanName = toPlainName(rawName);
    const nameKey = normalizeCompact(cleanName);
    if (!nameKey) return;

    const value = {
      name: cleanName,
      image: image || '',
      kana: normalizeKana(kana),
      chamber: normalizeWhitespace(chamber),
      party: normalizeWhitespace(party),
    };

    if (value.image && !byName.has(nameKey)) {
      byName.set(nameKey, value);
    }

    const kanaKey = `${value.chamber}:${value.kana}`;
    if (value.kana && value.chamber) {
      setUnique(byKanaChamber, kanaKey, value);
    }
  };

  for (const item of readJson('senators.json')) {
    const clean = toPlainName(item.name);
    const match = String(item.name ?? '').match(/（([^）]+)）/u);
    add(clean, match?.[1] ?? '', item.images?.[0] ?? '', '参議院', item.party ?? item.group ?? '');
  }

  for (const item of readJson('representatives.json')) {
    add(item.name, item.kana ?? '', item.image ?? '', '衆議院', item.party ?? item.group ?? '');
  }

  for (const item of readJson('ministers.json')) {
    const clean = toPlainName(item.name);
    const chamber = /参議院/.test(item.group ?? '') ? '参議院' : /衆議院/.test(item.group ?? '') ? '衆議院' : '';
    add(clean, '', item.images?.[0] ?? '', chamber, '');
  }

  return { byName, byKanaChamber };
}

function resolveMatchedPerson(entry, imageMap) {
  const nameKey = normalizeCompact(entry.name);
  const direct = imageMap.byName.get(nameKey);
  if (direct) return direct;

  const kana = normalizeKana(entry.kana);
  const chamber = normalizeWhitespace(entry.chamber);
  if (kana && chamber) {
    const kanaMatch = imageMap.byKanaChamber.get(`${chamber}:${kana}`);
    if (kanaMatch) return kanaMatch;
  }

  return null;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function scoreEntries(label, entries) {
  const keywords = ROLE_KEYWORDS[label] ?? [];
  const uniqueNames = new Set(entries.map((entry) => normalizeCompact(entry.name)).filter(Boolean));
  const uniqueRoles = new Set(entries.map((entry) => normalizeWhitespace(entry.subRole)).filter(Boolean));
  const duplicates = entries.length - uniqueNames.size;
  let score = entries.length * 10;
  score += uniqueRoles.size * 2;
  score -= duplicates * 15;
  for (const entry of entries) {
    const role = normalizeWhitespace(entry.subRole);
    const name = normalizeWhitespace(entry.name);
    const kana = normalizeKana(entry.kana);
    if (name) score += 3;
    if (kana) score += 1;
    if (/^[一-龯々ぁ-んァ-ヶー・\s]+$/u.test(name)) score += 3;
    if (keywords.some((keyword) => role.includes(keyword))) score += 4;
    if (/^(衆議院|参議院)$/.test(entry.chamber)) score += 2;
  }
  return score;
}

function chooseBestCandidates(label, candidates) {
  const normalized = candidates
    .map((candidate) => ({ ...candidate, entries: uniqueBy(candidate.entries ?? [], (entry) => `${normalizeWhitespace(entry.subRole)}:${normalizeCompact(entry.name)}:${normalizeWhitespace(entry.chamber)}`) }))
    .filter((candidate) => candidate.entries.length > 0)
    .map((candidate) => ({ ...candidate, score: scoreEntries(label, candidate.entries) }));

  if (normalized.length === 0) return [];

  normalized.sort((a, b) => b.score - a.score || b.entries.length - a.entries.length);
  const winner = normalized[0];
  console.log(`${label}: choose ${winner.tag} score=${winner.score} count=${winner.entries.length}`);
  return winner.entries;
}

function linesFromBodyText(html) {
  return cheerio.load(html)('body').text().split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
}

function parseCouncilorsOfficersFromText(html) {
  const lines = linesFromBodyText(html);
  const out = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/＜正字＞/g, '').trim();
    if (!line) continue;
    if (/^令和\d+年\d+月\d+日現在$/.test(line)) continue;
    if (/^第\d+回国会/u.test(line)) continue;
    if (/議員の名前をクリックすると/.test(line)) continue;
    if (/正確な表記が表示されます/.test(line)) continue;
    if (/^事務総長\s+/.test(line)) continue;
    if (/^利用案内/.test(line)) continue;

    let m = line.match(/^(議長|副議長)\s+(.+)$/u);
    if (m) {
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '', chamber: '参議院', sourceMode: 'live' });
      continue;
    }

    m = line.match(/^(常任委員長|特別委員長|調査会長)\s+(.+)$/u);
    if (m) {
      const body = m[2];
      const lastSpace = body.lastIndexOf(' ');
      if (lastSpace !== -1) {
        out.push({
          subRole: body.slice(0, lastSpace).trim(),
          name: toPlainName(body.slice(lastSpace + 1)),
          kana: '',
          chamber: '参議院',
          sourceMode: 'live',
        });
      }
      continue;
    }

    m = line.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
    if (m) {
      out.push({
        subRole: m[1],
        name: toPlainName(m[2]),
        kana: '',
        chamber: '参議院',
        sourceMode: 'live',
      });
    }
  }

  return uniqueBy(out, (item) => `${item.subRole}:${normalizeCompact(item.name)}`);
}

function parseCouncilorsOfficersFromDom(html) {
  const $ = cheerio.load(html);
  const out = [];

  $('a, td, th, li, p').each((_, node) => {
    const text = normalizeWhitespace($(node).text()).replace(/＜正字＞/g, '');
    if (!text) return;
    let m = text.match(/^(議長|副議長)\s+(.+)$/u);
    if (m) {
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '', chamber: '参議院', sourceMode: 'live' });
      return;
    }
    m = text.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
    if (m) {
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '', chamber: '参議院', sourceMode: 'live' });
    }
  });

  return uniqueBy(out, (item) => `${item.subRole}:${normalizeCompact(item.name)}`);
}

function extractKanteiTextCandidates(lines, label) {
  const out = [];
  const roleLines = [];
  const isTargetRoleLine = (line) => ROLE_KEYWORDS[label].some((keyword) => line.includes(keyword));

  for (const line of lines) {
    if (!line || line === '職名 氏名 備考') continue;
    if (line.includes('内閣ページに戻る')) break;

    const personMatch = line.match(/^(.+?)(衆議院|参議院)$/u);
    if (personMatch && /[（(]/u.test(personMatch[1])) {
      const raw = personMatch[1].trim();
      const m = raw.match(/^(.*?)（([^）]+)）$/u) ?? raw.match(/^(.*?)\(([^)]+)\)$/u);
      const name = toPlainName(m ? m[1] : raw);
      const kana = normalizeKana(m ? m[2] : '');
      const role = roleLines.join(' / ').replace(/・\s*/gu, '').trim();
      if (name && role && isTargetRoleLine(role)) {
        out.push({ subRole: role, name, kana, chamber: personMatch[2], sourceMode: 'live' });
      }
      roleLines.length = 0;
      continue;
    }

    if (line === '衆議院' || line === '参議院') continue;
    if (/^(職名|氏名|備考)$/.test(line)) continue;
    roleLines.push(line.replace(/^・\s*/u, ''));
  }

  return uniqueBy(out, (item) => `${normalizeWhitespace(item.subRole)}:${normalizeCompact(item.name)}:${item.chamber}`);
}

function extractKanteiDomCandidates(html, label) {
  const $ = cheerio.load(html);
  const out = [];
  const isTargetRole = (role) => ROLE_KEYWORDS[label].some((keyword) => role.includes(keyword));

  $('tr').each((_, tr) => {
    const cells = $(tr).find('th, td').map((__, cell) => normalizeWhitespace($(cell).text())).get().filter(Boolean);
    if (cells.length < 2) return;

    const role = cells[0].replace(/^・\s*/u, '');
    const personCell = cells.find((cell) => /[（(].+[）)]/.test(cell) && /(衆議院|参議院)/.test(cell));
    if (!role || !personCell || !isTargetRole(role)) return;

    const personMatch = personCell.match(/^(.+?)(衆議院|参議院)$/u);
    if (!personMatch) return;
    const raw = personMatch[1].trim();
    const parsed = raw.match(/^(.*?)（([^）]+)）$/u) ?? raw.match(/^(.*?)\(([^)]+)\)$/u);
    const name = toPlainName(parsed ? parsed[1] : raw);
    const kana = normalizeKana(parsed ? parsed[2] : '');
    out.push({
      subRole: role,
      name,
      kana,
      chamber: personMatch[2],
      sourceMode: 'live',
    });
  });

  return uniqueBy(out, (item) => `${normalizeWhitespace(item.subRole)}:${normalizeCompact(item.name)}:${item.chamber}`);
}

function parseKanteiRolePage(html, label) {
  const lines = linesFromBodyText(html);
  const startIndexes = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line === '職名 氏名 備考' || ROLE_KEYWORDS[label].some((keyword) => line.includes(keyword)))
    .map(({ index }) => index);

  const textCandidates = [];
  const baseText = extractKanteiTextCandidates(lines, label);
  textCandidates.push({ tag: 'text:full', entries: baseText });

  for (const start of startIndexes.slice(0, 8)) {
    const windowLines = lines.slice(Math.max(0, start - 2));
    textCandidates.push({ tag: `text:window:${start}`, entries: extractKanteiTextCandidates(windowLines, label) });
  }

  const domCandidates = [{ tag: 'dom:table', entries: extractKanteiDomCandidates(html, label) }];
  return chooseBestCandidates(label, [...textCandidates, ...domCandidates]);
}

function parseHouseOfficers(html) {
  if (/ただいまメンテナンス中/.test(html)) {
    return FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
  }

  const lines = linesFromBodyText(html);
  const start = lines.findIndex((line) => line.includes('役員等一覧'));
  if (start === -1) {
    return FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
  }

  const out = [];
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/事務総長/.test(line)) break;
    if (/^(議長|副議長|.+委員長|.+会長)\s+/.test(line)) {
      const lastSpace = line.lastIndexOf(' ');
      if (lastSpace === -1) continue;
      out.push({
        subRole: line.slice(0, lastSpace).trim(),
        name: toPlainName(line.slice(lastSpace + 1)),
        kana: '',
        chamber: '衆議院',
        sourceMode: 'live',
      });
    }
  }

  const unique = uniqueBy(out, (item) => `${item.subRole}:${normalizeCompact(item.name)}`);
  return unique.length > 0 ? unique : FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
}

function withImages(entries, category, imageMap, sourceUrl) {
  return entries.map((entry) => {
    const matched = resolveMatchedPerson(entry, imageMap);
    const chamber = entry.chamber || matched?.chamber || '';
    const kana = normalizeKana(entry.kana || matched?.kana || '');
    const displayName = matched?.name || toPlainName(entry.name);
    const groupParts = [entry.subRole, chamber].filter(Boolean);
    return {
      id: stableId(category, entry.subRole, displayName),
      name: displayName,
      kana,
      group: groupParts.join(' / '),
      role: category,
      subRole: entry.subRole,
      chamber,
      party: matched?.party || '',
      images: matched?.image ? [matched.image] : [],
      sourceUrl,
      sourceMode: entry.sourceMode || 'live',
    };
  });
}

function mergeByNameAndRole(parsed, existing, category) {
  const existingMap = new Map(existing.map((item) => [`${normalizeCompact(item.name)}:${normalizeWhitespace(item.subRole)}`, item]));
  const merged = [];

  for (const item of parsed) {
    const key = `${normalizeCompact(item.name)}:${normalizeWhitespace(item.subRole)}`;
    const prev = existingMap.get(key);
    existingMap.delete(key);
    if (!prev) {
      merged.push(item);
      continue;
    }

    const better = {
      ...prev,
      ...item,
      images: Array.isArray(item.images) && item.images.length > 0 ? item.images : prev.images,
      party: item.party || prev.party || '',
      kana: item.kana || prev.kana || '',
      chamber: item.chamber || prev.chamber || '',
      sourceMode: item.sourceMode || prev.sourceMode || 'seed',
      sourceUrl: item.sourceUrl || prev.sourceUrl || '',
    };
    better.id = stableId(category, better.subRole, better.name);
    merged.push(better);
  }

  for (const leftover of existingMap.values()) {
    merged.push({ ...leftover, sourceMode: leftover.sourceMode || 'seed' });
  }

  return uniqueBy(merged, (item) => `${normalizeWhitespace(item.subRole)}:${normalizeCompact(item.name)}:${normalizeWhitespace(item.chamber)}`)
    .sort((a, b) => normalizeWhitespace(a.subRole).localeCompare(normalizeWhitespace(b.subRole), 'ja') || normalizeCompact(a.name).localeCompare(normalizeCompact(b.name), 'ja'));
}

function validateEntries(label, entries) {
  if (!Array.isArray(entries) || entries.length === 0) return { ok: false, reason: 'empty' };
  const minCount = MIN_COUNTS[label] ?? 1;
  const nameSet = new Set(entries.map((item) => normalizeCompact(item.name)).filter(Boolean));
  const duplicateCount = entries.length - nameSet.size;
  if (entries.length < minCount) return { ok: false, reason: `too-small:${entries.length}` };
  if (duplicateCount > Math.max(2, Math.floor(entries.length * 0.15))) return { ok: false, reason: `too-many-duplicates:${duplicateCount}` };
  const badRows = entries.filter((item) => !normalizeWhitespace(item.subRole) || !normalizeCompact(item.name) || !normalizeWhitespace(item.chamber));
  if (badRows.length > 0) return { ok: false, reason: `invalid-rows:${badRows.length}` };
  return { ok: true, reason: 'ok' };
}

async function safeGenerate({ label, parser, url, category, imageMap, sourceUrl, fileName }) {
  const existing = readExistingArray(fileName);
  try {
    const html = await fetchText(url);
    const parsedEntries = parser(html, label);
    const validation = validateEntries(label, parsedEntries);
    if (!validation.ok) {
      console.warn(`${label}: parsed but rejected (${validation.reason}) → keep existing (${existing.length})`);
      return existing;
    }
    const parsed = withImages(parsedEntries, category, imageMap, sourceUrl);
    const merged = mergeByNameAndRole(parsed, existing, category);
    const mergedValidation = validateEntries(label, merged);
    if (!mergedValidation.ok) {
      console.warn(`${label}: merged but rejected (${mergedValidation.reason}) → keep existing (${existing.length})`);
      return existing;
    }
    console.log(`${label}: parsed → OK (${parsed.length}), merged=${merged.length}`);
    return merged;
  } catch (error) {
    if (existing.length > 0) {
      console.warn(`${label}: failed → keep existing (${existing.length}) because ${error.message}`);
      return existing;
    }
    throw error;
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const imageMap = buildImageMap();
  const kanteiUrls = await resolveKanteiMeiboUrls();
  console.log(`role panels sources: vice=${kanteiUrls.viceMinistersUrl} seimukan=${kanteiUrls.parliamentarySecretariesUrl}`);

  const councilorsOfficers = await safeGenerate({
    label: '参議院役員',
    parser: (html) => chooseBestCandidates('参議院役員', [
      { tag: 'text:body', entries: parseCouncilorsOfficersFromText(html) },
      { tag: 'dom:nodes', entries: parseCouncilorsOfficersFromDom(html) },
    ]),
    url: URLS.councilorsOfficers,
    category: '参議院役員',
    imageMap,
    sourceUrl: URLS.councilorsOfficers,
    fileName: 'councilors-officers.json',
  });

  const viceMinisters = await safeGenerate({
    label: '副大臣',
    parser: (html) => parseKanteiRolePage(html, '副大臣'),
    url: kanteiUrls.viceMinistersUrl,
    category: '副大臣',
    imageMap,
    sourceUrl: kanteiUrls.viceMinistersUrl,
    fileName: 'vice-ministers.json',
  });

  const parliamentarySecretaries = await safeGenerate({
    label: '大臣政務官',
    parser: (html) => parseKanteiRolePage(html, '大臣政務官'),
    url: kanteiUrls.parliamentarySecretariesUrl,
    category: '大臣政務官',
    imageMap,
    sourceUrl: kanteiUrls.parliamentarySecretariesUrl,
    fileName: 'parliamentary-secretaries.json',
  });

  let houseOfficersEntries;
  try {
    houseOfficersEntries = parseHouseOfficers(await fetchText(URLS.houseOfficers));
  } catch (error) {
    console.warn(`衆議院役員: failed → fallback because ${error.message}`);
    houseOfficersEntries = FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
  }
  const houseOfficers = mergeByNameAndRole(
    withImages(houseOfficersEntries, '衆議院役員', imageMap, URLS.houseOfficers),
    readExistingArray('house-officers.json'),
    '衆議院役員',
  );

  writeJson('councilors-officers.json', councilorsOfficers);
  writeJson('vice-ministers.json', viceMinisters);
  writeJson('parliamentary-secretaries.json', parliamentarySecretaries);
  writeJson('house-officers.json', houseOfficers);

  console.log(`councilors-officers.json generated (${councilorsOfficers.length})`);
  console.log(`vice-ministers.json generated (${viceMinisters.length})`);
  console.log(`parliamentary-secretaries.json generated (${parliamentarySecretaries.length})`);
  console.log(`house-officers.json generated (${houseOfficers.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
