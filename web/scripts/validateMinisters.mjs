import fs from 'fs';
import path from 'path';

const file=path.resolve('public/data/ministers.json');
const data=JSON.parse(fs.readFileSync(file,'utf8'));

if(!Array.isArray(data)) throw new Error('ministers.json not array');

console.log('ministers.json OK',data.length);
