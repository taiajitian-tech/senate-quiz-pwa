import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../public/data');

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const URLS = {
  councilorsOfficers: 'https://www.sangiin.go.jp/japanese/joho1/kousei/giin/221/yakuin.htm',
  houseOfficers: 'https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/officer.htm',
  viceMinisters: 'https://www.kantei.go.jp/jp/105/meibo/fukudaijin.html',
  parliamentarySecretaries: 'https://www.kantei.go.jp/jp/105/meibo/seimukan.html',
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

function buildImageMap() {
  const map = new Map();
  const add = (rawName, kana, image, chamber, party) => {
    const key = normalizeCompact(rawName);
    if (!key || !image) return;
    if (!map.has(key)) {
      map.set(key, {
        image,
        kana: normalizeKana(kana),
        chamber: normalizeWhitespace(chamber),
        party: normalizeWhitespace(party),
      });
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

  return map;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function parseCouncilorsOfficers(html) {
  const lines = cheerio.load(html)('body').text().split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
  const start = lines.findIndex((line) => line.includes('令和8年3月20日現在'));
  if (start === -1) throw new Error('参議院役員一覧の開始位置を特定できませんでした');
  const out = [];
  let currentLabel = '';
  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line === '事務総長 伊藤 文靖' || line.includes('利用案内')) break;
    if (!line) continue;

    if (/^(議長|副議長)\s+/.test(line)) {
      const m = line.match(/^(議長|副議長)\s+(.+)$/u);
      if (!m) continue;
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '' });
      currentLabel = '';
      continue;
    }
    if (/^(常任委員長|特別委員長|調査会長)\s+/.test(line)) {
      const m = line.match(/^(常任委員長|特別委員長|調査会長)\s+(.+)$/u);
      if (!m) continue;
      const text = m[2];
      const lastSpace = text.lastIndexOf(' ');
      if (lastSpace === -1) continue;
      out.push({ subRole: text.slice(0, lastSpace).trim(), name: toPlainName(text.slice(lastSpace + 1)), kana: '' });
      currentLabel = m[1];
      continue;
    }
    if (/^(憲法審査会会長|情報監視審査会会長|政治倫理審査会会長)\s+/.test(line)) {
      const m = line.match(/^(憲法審査会会長|情報監視審査会会長|政治倫理審査会会長)\s+(.+)$/u);
      if (!m) continue;
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '' });
      currentLabel = '';
      continue;
    }
    if (currentLabel && /委員長 /.test(line)) {
      const lastSpace = line.lastIndexOf(' ');
      if (lastSpace !== -1) {
        out.push({ subRole: line.slice(0, lastSpace).trim(), name: toPlainName(line.slice(lastSpace + 1)), kana: '' });
      }
    }
  }
  return out;
}

function parseKanteiRolePage(html) {
  const lines = cheerio.load(html)('body').text().split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
  const start = lines.findIndex((line) => line === '職名 氏名 備考');
  if (start === -1) throw new Error('官邸ページの開始位置を特定できませんでした');
  const out = [];
  let roleLines = [];

  for (let i = start + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes('内閣ページに戻る')) break;
    if (!line || line === '職名 氏名 備考') continue;

    const personMatch = line.match(/^(.+?)(衆議院|参議院)$/u);
    if (personMatch && /[（(]/u.test(personMatch[1])) {
      const raw = personMatch[1].trim();
      const m = raw.match(/^(.*?)（([^）]+)）$/u) ?? raw.match(/^(.*?)\(([^)]+)\)$/u);
      const name = toPlainName(m ? m[1] : raw);
      const kana = normalizeKana(m ? m[2] : '');
      out.push({
        subRole: roleLines.join(' / ').replace(/・\s*/gu, '').trim(),
        name,
        kana,
        chamber: personMatch[2],
      });
      roleLines = [];
      continue;
    }

    if (line === '衆議院' || line === '参議院') continue;
    roleLines.push(line.replace(/^・\s*/u, ''));
  }

  return out;
}

function parseHouseOfficers(html) {
  if (/ただいまメンテナンス中/.test(html)) {
    return FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
  }

  const lines = cheerio.load(html)('body').text().split('\n').map((line) => normalizeWhitespace(line)).filter(Boolean);
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
  return out.length > 0 ? out : FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
}

function withImages(entries, category, imageMap, sourceUrl) {
  return entries.map((entry) => {
    const key = normalizeCompact(entry.name);
    const matched = imageMap.get(key);
    const chamber = entry.chamber || matched?.chamber || '';
    const kana = entry.kana || matched?.kana || '';
    const groupParts = [entry.subRole, chamber].filter(Boolean);
    return {
      id: stableId(category, entry.subRole, entry.name),
      name: toPlainName(entry.name),
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

function writeJson(fileName, data) {
  fs.writeFileSync(path.join(DATA_DIR, fileName), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

async function safeParse(label, parser, url) {
  const html = await fetchText(url);
  const parsed = parser(html);
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error(`${label} の結果が空です`);
  return parsed;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const imageMap = buildImageMap();

  const councilorsOfficers = withImages(
    await safeParse('参議院役員', parseCouncilorsOfficers, URLS.councilorsOfficers),
    '参議院役員',
    imageMap,
    URLS.councilorsOfficers,
  );

  const viceMinisters = withImages(
    await safeParse('副大臣', parseKanteiRolePage, URLS.viceMinisters),
    '副大臣',
    imageMap,
    URLS.viceMinisters,
  );

  const parliamentarySecretaries = withImages(
    await safeParse('大臣政務官', parseKanteiRolePage, URLS.parliamentarySecretaries),
    '大臣政務官',
    imageMap,
    URLS.parliamentarySecretaries,
  );

  let houseOfficersEntries;
  try {
    houseOfficersEntries = parseHouseOfficers(await fetchText(URLS.houseOfficers));
  } catch {
    houseOfficersEntries = FALLBACK_HOUSE_OFFICERS.map((item) => ({ ...item, chamber: '衆議院', sourceMode: 'fallback' }));
  }
  const houseOfficers = withImages(houseOfficersEntries, '衆議院役員', imageMap, URLS.houseOfficers);

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
