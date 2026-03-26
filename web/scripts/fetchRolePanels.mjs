// patched parseCouncilorsOfficers (no break on 事務総長 / 利用案内)
function parseCouncilorsOfficers(html) {
  const lines = cheerio
    .load(html)('body')
    .text()
    .split('\n')
    .map((line) => normalizeWhitespace(line))
    .filter(Boolean);

  const out = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/＜正字＞/g, '').trim();
    if (!line) continue;

    let m = line.match(/^(議長|副議長)\s+(.+)$/u);
    if (m) {
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '' });
      continue;
    }

    m = line.match(/^(.+?(?:委員長|会長))\s+(.+)$/u);
    if (m) {
      out.push({ subRole: m[1], name: toPlainName(m[2]), kana: '' });
      continue;
    }
  }

  return out;
}
