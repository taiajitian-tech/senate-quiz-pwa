// AI auto-fallback version (safe + self-judging)

function isValidCount(label, list) {
  if (!Array.isArray(list)) return false;
  if (label === '参議院役員') return list.length >= 20;
  if (label === '副大臣') return list.length >= 10;
  if (label === '大臣政務官') return list.length >= 10;
  return list.length > 0;
}

function safeReturn(label, parsed, existing) {
  if (!isValidCount(label, parsed)) {
    console.warn(`${label}: failed → keep existing (${existing.length})`);
    return existing;
  }
  console.log(`${label}: parsed (${parsed.length})`);
  return parsed;
}

function parseCouncilorsOfficers(html) {
  const text = cheerio.load(html)('body').text();

  const matches = [...text.matchAll(/(.+?(?:委員長|会長|議長|副議長))\s+([一-龯ぁ-んァ-ン]+)/g)];

  return matches.map(m => ({
    subRole: m[1],
    name: m[2],
    kana: '',
    chamber: '参議院'
  }));
}

async function mainPatch(existingData) {
  const html = await fetchText(URLS.councilorsOfficers);

  let parsed = parseCouncilorsOfficers(html);

  parsed = safeReturn('参議院役員', parsed, existingData.councilorsOfficers);

  return parsed;
}
