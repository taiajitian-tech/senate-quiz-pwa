
import fs from 'fs';

const FILE = './web/public/data/representatives.json';

const isValidYomiuri = (url) => {
  if (!url) return false;
  return url.includes('yomiuri') && !url.includes('ogp') && !url.includes('default');
};

const main = async () => {
  const data = JSON.parse(fs.readFileSync(FILE, 'utf-8'));

  const fixed = data.map(p => {
    // 既に正常な読売画像なら絶対保持
    if (isValidYomiuri(p.image)) {
      return { ...p, imageStatus: 'ok' };
    }

    // それ以外は触らない（壊さない）
    return p;
  });

  fs.writeFileSync(FILE, JSON.stringify(fixed, null, 2));
  console.log('yomiuri lock applied');
};

main();
