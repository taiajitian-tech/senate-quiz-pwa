import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../public/data');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const URLS = {
  viceMinisters: 'https://www.kantei.go.jp/jp/105/meibo/fukudaijin.html',
  parliamentarySecretaries: 'https://www.kantei.go.jp/jp/105/meibo/seimukan.html',
  houseOfficers: 'https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/officer.htm',
  councilorsOfficersEntry: 'https://www.sangiin.go.jp/japanese/joho1/kousei/giin/current/yakuin.htm',
};

const FILES = {
  viceMinisters: path.join(DATA_DIR, 'vice-ministers.json'),
  parliamentarySecretaries: path.join(DATA_DIR, 'parliamentary-secretaries.json'),
  houseOfficers: path.join(DATA_DIR, 'house-officers.json'),
  councilorsOfficers: path.join(DATA_DIR, 'councilors-officers.json'),
  representatives: path.join(DATA_DIR, 'representatives.json'),
  senators: path.join(DATA_DIR, 'senators.json'),
};

const ROLE_CONFIG = {
  viceMinisters: {
    label: '副大臣',
    role: '副大臣',
    minCount: 10,
    sourceUrl: URLS.viceMinisters,
  },
  parliamentarySecretaries: {
    label: '大臣政務官',
    role: '大臣政務官',
    minCount: 10,
    sourceUrl: URLS.parliamentarySecretaries,
  },
  houseOfficers: {
    label: '衆議院役員',
    role: '衆議院役員',
    minCount: 10,
    sourceUrl: URLS.houseOfficers,
  },
  councilorsOfficers: {
    label: '参議院役員',
    role: '参議院役員',
    minCount: 20,
    sourceUrl: URLS.councilorsOfficersEntry,
  },
};

function readJson(filePath, fallback = []) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[\t\r]+/g, ' ')
    .replace(/[ \u3000]+/g, ' ')
    .replace(/\n[ \u3000]*/g, '\n')
    .trim();
}

function normalizeCompact(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/[\s\u3000]+/gu, '')
    .replace(/君$/u, '')
    .trim();
}

function cleanName(text) {
  return normalizeWhitespace(text)
    .replace(/[（(][^）)]*[）)]/gu, '')
    .replace(/君$/u, '')
    .trim();
}

function cleanKana(text) {
  return normalizeWhitespace(text).replace(/[\s\u3000]+/gu, '');
}

function stableId(seed) {
  const value = String(seed ?? '');
  let hash = 0;
  for (const ch of value) {
    hash = (hash * 131 + ch.codePointAt(0)) % 90000000;
  }
  return 10000000 + hash;
}

function uniqueBy(items, keyFn) {
  const out = [];
  const seen = new Set();
  for (const item of items) {
    const key = keyFn(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function hasJapanese(text) {
  return /[一-龯ぁ-んァ-ヶ々]/u.test(String(text ?? ''));
}

function stripFooterNoise(text) {
  return String(text ?? '')
    .replace(/利用案内[\s\S]*$/u, '')
    .replace(/内閣ページに戻る[\s\S]*$/u, '')
    .replace(/All rights reserved\.[\s\S]*$/u, '')
    .replace(/庶務部情報基盤整備室[\s\S]*$/u, '')
    .trim();
}

async function fetchText(url) {
  const res = await fetch(url, {
    redirect: 'follow',
    headers: {
      'user-agent': UA,
      accept: 'text/html,application/xhtml+xml',
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const html = await res.text();
  return { html, finalUrl: res.url || url };
}

function extractAbsoluteUrl(base, href) {
  try {
    return new URL(href, base).toString();
  } catch {
    return '';
  }
}

function buildReferenceMaps() {
  const reps = readJson(FILES.representatives, []);
  const sens = readJson(FILES.senators, []);

  const repMap = new Map();
  for (const item of reps) {
    const key = normalizeCompact(item?.name);
    if (!key) continue;
    repMap.set(key, {
      kana: cleanKana(item?.kana || ''),
      chamber: item?.house || '衆議院',
      party: item?.party || '',
      images: item?.image ? [item.image] : [],
    });
  }

  const senMap = new Map();
  for (const item of sens) {
    const key = normalizeCompact(item?.name);
    if (!key) continue;
    senMap.set(key, {
      kana: cleanKana(item?.kana || ''),
      chamber: '参議院',
      party: item?.party || item?.group || '',
      images: Array.isArray(item?.images) ? item.images.filter(Boolean) : [],
    });
  }

  return { repMap, senMap };
}

function buildExistingMap(items) {
  const map = new Map();
  for (const item of items) {
    const key = normalizeCompact(item?.name);
    if (!key) continue;
    map.set(key, item);
  }
  return map;
}

function resolvePersonMeta(name, chamber, refs, existingItem) {
  const key = normalizeCompact(name);
  const source = chamber === '参議院' ? refs.senMap.get(key) : refs.repMap.get(key);
  const images = [];

  if (Array.isArray(existingItem?.images)) images.push(...existingItem.images.filter(Boolean));
  if (Array.isArray(source?.images)) images.push(...source.images.filter(Boolean));

  return {
    kana: source?.kana || cleanKana(existingItem?.kana || ''),
    party: source?.party || existingItem?.party || '',
    images: [...new Set(images)],
  };
}

function createRoleItem(raw, config, refs, existingMap) {
  const name = cleanName(raw?.name || '');
  const subRole = normalizeWhitespace(raw?.subRole || '');
  const chamber = raw?.chamber === '参議院' ? '参議院' : '衆議院';
  if (!name || !subRole) return null;

  const existing = existingMap.get(normalizeCompact(name));
  const meta = resolvePersonMeta(name, chamber, refs, existing);

  return {
    id: Number(existing?.id) || stableId(`${config.role}:${chamber}:${name}:${subRole}`),
    name,
    kana: meta.kana || '',
    group: `${subRole} / ${chamber}`,
    role: config.role,
    subRole,
    chamber,
    party: meta.party || '',
    images: meta.images,
    sourceUrl: config.sourceUrl,
    sourceMode: 'self-judged',
  };
}

function isLikelyRoleLine(line, config) {
  if (!line) return false;
  if (config.role === '副大臣') return /副大臣/u.test(line);
  if (config.role === '大臣政務官') return /大臣政務官/u.test(line);
  return /(委員長|会長|議長|副議長)/u.test(line);
}

function isNameLine(line) {
  return /(衆議院|参議院)/u.test(line) || /[（(][ぁ-んァ-ヶー\s]+[）)]/u.test(line);
}

function parseNameLine(line) {
  const normalized = normalizeWhitespace(line);
  const chamber = normalized.includes('参議院') ? '参議院' : normalized.includes('衆議院') ? '衆議院' : '';
  const stripped = normalizeWhitespace(normalized.replace(/(衆議院|参議院)/gu, '').trim());
  const match = stripped.match(/^(.+?)[（(]([ぁ-んァ-ヶー\s]+)[）)]$/u);
  if (match) {
    return {
      name: cleanName(match[1]),
      kana: cleanKana(match[2]),
      chamber,
    };
  }
  return {
    name: cleanName(stripped),
    kana: '',
    chamber,
  };
}

function scoreRoleCandidates(config, list, refs, existingCount) {
  if (!Array.isArray(list) || list.length === 0) return -999999;

  const uniqueNames = new Set();
  const roleTexts = new Set();
  let matchedRefs = 0;
  let withChamber = 0;
  let withImages = 0;
  let suspicious = 0;

  for (const item of list) {
    const key = normalizeCompact(item?.name);
    if (key) uniqueNames.add(key);
    if (item?.subRole) roleTexts.add(item.subRole);
    if (item?.chamber) withChamber += 1;
    if (Array.isArray(item?.images) && item.images.length > 0) withImages += 1;
    if (item?.chamber === '参議院') {
      if (refs.senMap.has(key)) matchedRefs += 1;
    } else if (refs.repMap.has(key)) {
      matchedRefs += 1;
    }
    if (!item?.name || !hasJapanese(item.name)) suspicious += 1;
    if (!item?.subRole || !isLikelyRoleLine(item.subRole, config)) suspicious += 1;
  }

  const duplicatePenalty = list.length - uniqueNames.size;
  let score = 0;
  score += list.length * 10;
  score += uniqueNames.size * 8;
  score += roleTexts.size * 4;
  score += matchedRefs * 6;
  score += withChamber * 2;
  score += withImages;
  score -= duplicatePenalty * 30;
  score -= suspicious * 10;

  if (list.length < config.minCount) score -= 500;
  if (uniqueNames.size < config.minCount) score -= 500;
  if (existingCount && list.length < Math.floor(existingCount * 0.6)) score -= 200;

  return score;
}

function isValidRoleList(config, list) {
  if (!Array.isArray(list)) return false;
  if (list.length < config.minCount) return false;
  const names = list.map((item) => normalizeCompact(item?.name)).filter(Boolean);
  if (new Set(names).size !== names.length) return false;
  if (list.some((item) => !item?.subRole || !item?.name || !item?.chamber)) return false;
  return true;
}

function safeReturn(config, parsed, existing) {
  if (!isValidRoleList(config, parsed)) {
    console.warn(`${config.label}: failed → keep existing (${existing.length})`);
    return existing;
  }
  console.log(`${config.label}: parsed → OK (${parsed.length})`);
  return parsed;
}

function parseKanteiByText(html, config, refs, existingMap) {
  const $ = cheerio.load(html);
  let text = stripFooterNoise(normalizeWhitespace($('body').text()));
  const marker = config.role === '副大臣' ? '職名 氏名 備考' : '職名 氏名 備考';
  const idx = text.indexOf(marker);
  if (idx >= 0) text = text.slice(idx + marker.length);

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line.replace(/^・\s*/u, '').replace(/^\*\s*/u, '')))
    .filter(Boolean)
    .filter((line) => !/^第.+内閣/u.test(line))
    .filter((line) => !/^令和/u.test(line));

  const roles = [];
  const out = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    if (isLikelyRoleLine(line, config) && !isNameLine(line)) {
      roles.push(line);
      continue;
    }
    if (isNameLine(line)) {
      const parsed = parseNameLine(line);
      const subRole = roles.join(' / ');
      if (parsed.name && parsed.chamber && subRole) {
        const item = createRoleItem({ name: parsed.name, subRole, chamber: parsed.chamber }, config, refs, existingMap);
        if (item) out.push(item);
      }
      roles.length = 0;
    }
  }

  return uniqueBy(out, (item) => `${normalizeCompact(item.name)}::${item.subRole}`);
}

function parseKanteiByDom(html, sourceUrl, config, refs, existingMap) {
  const $ = cheerio.load(html);
  const body = $('body');
  const anchors = body.find('a').toArray();
  const out = [];

  for (const a of anchors) {
    const text = normalizeWhitespace($(a).text());
    if (!text) continue;
    if (!/[（(]/u.test(text) || !hasJapanese(text)) continue;

    const parentText = normalizeWhitespace($(a).parent().text());
    const chamber = /参議院/u.test(parentText) ? '参議院' : /衆議院/u.test(parentText) ? '衆議院' : '';
    if (!chamber) continue;

    const prevTexts = [];
    let prev = $(a).parent().prev();
    for (let guard = 0; guard < 4 && prev.length; guard += 1) {
      const v = normalizeWhitespace(prev.text());
      if (!v) {
        prev = prev.prev();
        continue;
      }
      if (isLikelyRoleLine(v, config)) {
        prevTexts.unshift(v);
        prev = prev.prev();
        continue;
      }
      break;
    }

    const parsed = parseNameLine(`${text} ${chamber}`);
    const item = createRoleItem(
      {
        name: parsed.name,
        subRole: prevTexts.join(' / '),
        chamber,
      },
      config,
      refs,
      existingMap,
    );
    if (item) out.push(item);
  }

  return uniqueBy(out, (item) => `${normalizeCompact(item.name)}::${item.subRole}`);
}

function chooseBestKanteiParse(html, config, refs, existing) {
  const existingMap = buildExistingMap(existing);
  const textParsed = parseKanteiByText(html, config, refs, existingMap);
  const domParsed = parseKanteiByDom(html, config.sourceUrl, config, refs, existingMap);

  const textScore = scoreRoleCandidates(config, textParsed, refs, existing.length);
  const domScore = scoreRoleCandidates(config, domParsed, refs, existing.length);

  console.log(`${config.label}: self-judge text=${textParsed.length}/${textScore} dom=${domParsed.length}/${domScore}`);
  return domScore > textScore ? domParsed : textParsed;
}

function parseCouncilorsOfficers(html, finalUrl, refs, existing) {
  const config = ROLE_CONFIG.councilorsOfficers;
  const existingMap = buildExistingMap(existing);
  const $ = cheerio.load(html);
  let text = stripFooterNoise(normalizeWhitespace($('body').text()));
  const start = text.indexOf('令和');
  if (start >= 0) text = text.slice(start);
  const nowIndex = text.indexOf('現在');
  if (nowIndex >= 0) text = text.slice(nowIndex + 2);
  text = text.replace(/議員の名前をクリックすると[\s\S]*?令和\d+年\d+月\d+日現在/u, '');
  text = text.replace(/事務総長[\s\S]*$/u, '');

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean)
    .filter((line) => !/^参議院役員等一覧/u.test(line))
    .filter((line) => !/^第\d+回国会/u.test(line));

  let section = '';
  const out = [];

  for (const line of lines) {
    if (/^常任委員長/u.test(line)) {
      section = '常任委員長';
      const rest = normalizeWhitespace(line.replace(/^常任委員長/u, ''));
      if (!rest) continue;
      const m = rest.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
      if (m) {
        const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '参議院' }, config, refs, existingMap);
        if (item) out.push(item);
      }
      continue;
    }
    if (/^特別委員長/u.test(line)) {
      section = '特別委員長';
      const rest = normalizeWhitespace(line.replace(/^特別委員長/u, ''));
      if (!rest) continue;
      const m = rest.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
      if (m) {
        const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '参議院' }, config, refs, existingMap);
        if (item) out.push(item);
      }
      continue;
    }
    if (/^調査会長/u.test(line)) {
      section = '調査会長';
      const rest = normalizeWhitespace(line.replace(/^調査会長/u, ''));
      if (!rest) continue;
      const m = rest.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
      if (m) {
        const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '参議院' }, config, refs, existingMap);
        if (item) out.push(item);
      }
      continue;
    }
    if (/^事務総長/u.test(line)) break;

    const direct = line.match(/^(議長|副議長|憲法審査会会長|情報監視審査会会長|政治倫理審査会会長)\s+(.+)$/u);
    if (direct) {
      const item = createRoleItem({ name: direct[2], subRole: direct[1], chamber: '参議院' }, config, refs, existingMap);
      if (item) out.push(item);
      continue;
    }

    if (/^(内閣委員長|総務委員長|法務委員長|外交防衛委員長|財政金融委員長|文教科学委員長|厚生労働委員長|農林水産委員長|経済産業委員長|国土交通委員長|環境委員長|国家基本政策委員長|予算委員長|決算委員長|行政監視委員長|議院運営委員長|懲罰委員長)\s+/u.test(line)) {
      const m = line.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
      if (m) {
        const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '参議院' }, config, refs, existingMap);
        if (item) out.push(item);
      }
      continue;
    }

    if (section && /(?:委員長|会長)\s+/u.test(line)) {
      const m = line.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
      if (m) {
        const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '参議院' }, config, refs, existingMap);
        if (item) out.push(item);
      }
    }
  }

  return uniqueBy(out, (item) => `${normalizeCompact(item.name)}::${item.subRole}`);
}

function parseHouseOfficers(html, refs, existing) {
  const config = ROLE_CONFIG.houseOfficers;
  const existingMap = buildExistingMap(existing);
  const text = stripFooterNoise(normalizeWhitespace(cheerio.load(html)('body').text()));

  if (/メンテナンス中/u.test(text)) {
    return [];
  }

  const lines = text
    .split(/\n+/)
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const out = [];
  for (const line of lines) {
    const m = line.match(/^(.+?(?:議長|副議長|委員長|会長))\s+([一-龯ぁ-んァ-ヶ々ー\s]+)$/u);
    if (!m) continue;
    const item = createRoleItem({ name: m[2], subRole: m[1], chamber: '衆議院' }, config, refs, existingMap);
    if (item) out.push(item);
  }

  return uniqueBy(out, (item) => `${normalizeCompact(item.name)}::${item.subRole}`);
}

async function resolveCouncilorsUrl() {
  const { html, finalUrl } = await fetchText(URLS.councilorsOfficersEntry);
  const $ = cheerio.load(html);
  const directLink = $('a[href]').toArray().find((a) => /\/yakuin\.htm$/i.test($(a).attr('href') || ''));
  if (!directLink) return { html, finalUrl };
  const href = $(directLink).attr('href') || '';
  const resolved = extractAbsoluteUrl(finalUrl || URLS.councilorsOfficersEntry, href);
  if (!resolved || resolved === finalUrl) return { html, finalUrl };
  return fetchText(resolved);
}

async function main() {
  const refs = buildReferenceMaps();

  const existing = {
    viceMinisters: readJson(FILES.viceMinisters, []),
    parliamentarySecretaries: readJson(FILES.parliamentarySecretaries, []),
    houseOfficers: readJson(FILES.houseOfficers, []),
    councilorsOfficers: readJson(FILES.councilorsOfficers, []),
  };

  let viceMinisters = existing.viceMinisters;
  let parliamentarySecretaries = existing.parliamentarySecretaries;
  let houseOfficers = existing.houseOfficers;
  let councilorsOfficers = existing.councilorsOfficers;

  try {
    const { html } = await fetchText(URLS.viceMinisters);
    const parsed = chooseBestKanteiParse(html, ROLE_CONFIG.viceMinisters, refs, existing.viceMinisters);
    viceMinisters = safeReturn(ROLE_CONFIG.viceMinisters, parsed, existing.viceMinisters);
  } catch (error) {
    console.warn(`副大臣: failed → keep existing (${existing.viceMinisters.length})`, error?.message || error);
  }

  try {
    const { html } = await fetchText(URLS.parliamentarySecretaries);
    const parsed = chooseBestKanteiParse(
      html,
      ROLE_CONFIG.parliamentarySecretaries,
      refs,
      existing.parliamentarySecretaries,
    );
    parliamentarySecretaries = safeReturn(
      ROLE_CONFIG.parliamentarySecretaries,
      parsed,
      existing.parliamentarySecretaries,
    );
  } catch (error) {
    console.warn(
      `大臣政務官: failed → keep existing (${existing.parliamentarySecretaries.length})`,
      error?.message || error,
    );
  }

  try {
    const { html } = await fetchText(URLS.houseOfficers);
    const parsed = parseHouseOfficers(html, refs, existing.houseOfficers);
    houseOfficers = safeReturn(ROLE_CONFIG.houseOfficers, parsed, existing.houseOfficers);
  } catch (error) {
    console.warn(`衆議院役員: failed → keep existing (${existing.houseOfficers.length})`, error?.message || error);
  }

  try {
    const { html, finalUrl } = await resolveCouncilorsUrl();
    const parsed = parseCouncilorsOfficers(html, finalUrl, refs, existing.councilorsOfficers);
    councilorsOfficers = safeReturn(ROLE_CONFIG.councilorsOfficers, parsed, existing.councilorsOfficers);
  } catch (error) {
    console.warn(
      `参議院役員: failed → keep existing (${existing.councilorsOfficers.length})`,
      error?.message || error,
    );
  }

  writeJson(FILES.viceMinisters, viceMinisters);
  writeJson(FILES.parliamentarySecretaries, parliamentarySecretaries);
  writeJson(FILES.houseOfficers, houseOfficers);
  writeJson(FILES.councilorsOfficers, councilorsOfficers);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
