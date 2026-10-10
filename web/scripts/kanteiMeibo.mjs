import fetch from 'node-fetch';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';

const KANTEI_CURRENT_URLS = [
  'https://www.kantei.go.jp/',
  'https://www.kantei.go.jp/jp/rekidainaikaku/index.html',
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': USER_AGENT },
    redirect: 'follow',
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const html = await res.text();
  if (/<title[^>]*>[^<]*(Page Not Found|お探しのページ)/iu.test(html)) {
    throw new Error(`source page unavailable for ${url}`);
  }
  return html;
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
  if (currentStart < 0) collect(html);
  return unique(out);
}

async function resolveCurrentCabinetIndexUrl() {
  for (const url of KANTEI_CURRENT_URLS) {
    try {
      const html = await fetchText(url);
      const candidates = findMeiboIndexUrls(html);
      if (candidates.length > 0) return candidates[0];
    } catch (error) {
      console.warn(`kantei current cabinet discovery failed (${url}): ${error.message}`);
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
