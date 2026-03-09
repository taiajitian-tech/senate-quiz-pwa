import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

const OUT = path.resolve('public/data/ministers.json');

async function main(){
  const url='https://www.kantei.go.jp/jp/105/meibo/index.html';
  const html=await (await fetch(url)).text();
  const $=cheerio.load(html);

  const list=[];
  $('a').each((_,a)=>{
    const name=$(a).text().trim();
    const href=$(a).attr('href');
    if(!name) return;
    if(!href) return;
    if(!href.includes('kantei')) return;
    list.push({name,profile:href,images:[]});
  });

  fs.mkdirSync(path.dirname(OUT),{recursive:true});
  fs.writeFileSync(OUT,JSON.stringify(list,null,2),'utf8');
  console.log('ministers.json generated',list.length);
}

main();
