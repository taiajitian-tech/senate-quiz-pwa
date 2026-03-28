import fetch from 'node-fetch';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const KANTEI_HISTORY_URL = 'https://www.kantei.go.jp/jp/rekidainaikaku/index.html';
const KANTEI_FALLBACK_INDEX_URLS = [
  'https://www.kantei.go.jp/jp/105/meibo/index.html',
  'https://www.kantei.go.jp/jp/104/meibo/index.html',
  'https://www.kantei.go.jp/jp/103/meibo/index.html',
  'https://www.kantei.go.jp/jp/102/meibo/index.html',
  'https://www.kantei.go.jp/jp/101_kishida/meibo/index.html',
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return await res.text();
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function absoluteUrl(raw) {
  try {
    return new URL(raw, 'https://www.kantei.go.jp').href;
  } catch {
    return '';
  }
}

function findMeiboIndexUrls(html) {
  const out = [];
  const currentStart = html.indexOf('現職');
  const currentSlice = currentStart >= 0 ? html.slice(currentStart, currentStart + 120000) : html;

  const collect = (source) => {
    const regex = /href=["']([^"']+\/meibo\/index\.html)["']/giu;
    for (const match of source.matchAll(regex)) {
      out.push(absoluteUrl(match[1]));
    }
  };

  collect(currentSlice);
  collect(html);
  return unique(out);
}

async function resolveCurrentCabinetIndexUrl() {
  try {
    const html = await fetchText(KANTEI_HISTORY_URL);
    const candidates = findMeiboIndexUrls(html);
    if (candidates.length > 0) return candidates[0];
  } catch (error) {
    console.warn(`kantei current cabinet discovery failed: ${error.message}`);
  }

  for (const url of KANTEI_FALLBACK_INDEX_URLS) {
    try {
      await fetchText(url);
      return url;
    } catch {
      // try next fallback
    }
  }

  throw new Error('unable to resolve current kantei meibo index url');
}

export async function resolveKanteiMeiboUrls() {
  const indexUrl = await resolveCurrentCabinetIndexUrl();
  const base = indexUrl.replace(/index\.html(?:[?#].*)?$/u, '');
  return {
    indexUrl,
    ministersIndexUrl: indexUrl,
    viceMinistersUrl: new URL('fukudaijin.html', base).href,
    parliamentarySecretariesUrl: new URL('seimukan.html', base).href,
  };
}
