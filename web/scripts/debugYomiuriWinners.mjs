import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';

const BASE_URL = process.env.YOMIURI_DEBUG_URL || 'https://www.yomiuri.co.jp/election/shugiin/2026winners001/';
const OUT_DIR = path.resolve('..', 'yomiuri-debug');

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function uniqueBy(arr, keyFn) {
  const seen = new Set();
  const out = [];
  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  defaultViewport: { width: 1440, height: 2200 }
});

try {
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(5000);

  await page.evaluate(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    for (let i = 0; i < 8; i += 1) {
      window.scrollTo(0, document.body.scrollHeight);
      await wait(500);
    }
    window.scrollTo(0, 0);
  });

  for (const sel of ['button', '[role="button"]', 'a']) {
    const handles = await page.$$(sel);
    for (const handle of handles.slice(0, 40)) {
      try {
        const text = ((await page.evaluate((el) => (el.textContent || '').trim(), handle)) || '').replace(/\s+/g, ' ');
        if (/同意|承諾|許可|閉じる|OK|了解/i.test(text)) {
          await handle.click({ delay: 20 }).catch(() => {});
          await sleep(500);
        }
      } catch {}
    }
  }

  await sleep(2000);

  const html = await page.content();
  fs.writeFileSync(path.join(OUT_DIR, 'page.html'), html, 'utf8');
  await page.screenshot({ path: path.join(OUT_DIR, 'page.png'), fullPage: true });

  const pageMeta = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyTextSample: (document.body?.innerText || '').slice(0, 3000),
    anchorCount: document.querySelectorAll('a[href]').length,
    imgCount: document.querySelectorAll('img').length,
  }));
  fs.writeFileSync(path.join(OUT_DIR, 'meta.json'), JSON.stringify(pageMeta, null, 2), 'utf8');

  const anchors = await page.$$eval('a[href]', (nodes) =>
    nodes.map((a) => ({
      href: a.href,
      text: (a.textContent || '').replace(/\s+/g, ' ').trim(),
      html: a.outerHTML.slice(0, 1000)
    }))
  );

  const normalizedAnchors = uniqueBy(anchors, (a) => `${a.href}__${a.text}`);
  fs.writeFileSync(path.join(OUT_DIR, 'all-anchors.json'), JSON.stringify(normalizedAnchors, null, 2), 'utf8');

  const electionAnchors = normalizedAnchors.filter((a) => /\/election\/shugiin\//.test(a.href));
  fs.writeFileSync(path.join(OUT_DIR, 'election-anchors.json'), JSON.stringify(electionAnchors, null, 2), 'utf8');

  const winnerPages = uniqueBy(
    electionAnchors.filter((a) => /\/election\/shugiin\/2026winners\d+\//.test(a.href)),
    (a) => a.href
  );
  const candidatePages = uniqueBy(
    electionAnchors.filter((a) => /\/election\/shugiin\/2026\/[A-Z0-9]+\/\d+\//i.test(a.href)),
    (a) => a.href
  );

  fs.writeFileSync(path.join(OUT_DIR, 'winner-pages.json'), JSON.stringify(winnerPages, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUT_DIR, 'candidate-pages.json'), JSON.stringify(candidatePages, null, 2), 'utf8');

  const summary = {
    baseUrl: BASE_URL,
    anchorCount: normalizedAnchors.length,
    electionAnchorCount: electionAnchors.length,
    winnerPages: winnerPages.length,
    candidatePages: candidatePages.length,
    sampleCandidates: candidatePages.slice(0, 20)
  };
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  console.log(`debug-yomiuri: anchorCount=${summary.anchorCount}`);
  console.log(`debug-yomiuri: electionAnchorCount=${summary.electionAnchorCount}`);
  console.log(`debug-yomiuri: winnerPages=${summary.winnerPages}`);
  console.log(`debug-yomiuri: candidatePages=${summary.candidatePages}`);

  if (candidatePages.length === 0) {
    console.error('debug-yomiuri: candidatePages=0');
    process.exitCode = 1;
  }
} finally {
  await browser.close();
}
