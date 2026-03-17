
import fetch from "node-fetch";
import cheerio from "cheerio";

const BASE = "https://www.yomiuri.co.jp";

async function fetchHTML(url){
  const res = await fetch(url);
  return await res.text();
}

// 一覧ページから個別URL取得
async function getDetailLinks(listUrl){
  const html = await fetchHTML(listUrl);
  const $ = cheerio.load(html);

  const links = [];

  $("a").each((_, el)=>{
    const href = $(el).attr("href");
    if(!href) return;

    if(href.includes("/election/shugiin/2026/") && href.match(/\d+\/?$/)){
      const full = href.startsWith("http") ? href : BASE + href;
      links.push(full);
    }
  });

  return [...new Set(links)];
}

// 個別ページから「バラ付き」候補だけ取得
async function extractWinner(detailUrl){
  const html = await fetchHTML(detailUrl);
  const $ = cheerio.load(html);

  let result = null;

  $("tr, .candidate, li").each((_, el)=>{
    const block = $(el);

    // バラ画像判定
    const hasRose = block.find("img").toArray().some(img=>{
      const src = $(img).attr("src") || "";
      return src.includes("rose") || src.includes("winner") || src.includes("当選");
    });

    if(!hasRose) return;

    const name = block.text().replace(/\s+/g," ").trim();

    const img = block.find("img").first();
    let src = img.attr("src");

    if(!src) return;

    if(!src.startsWith("http")) src = BASE + src;

    result = {
      name,
      image: src,
      url: detailUrl
    };
  });

  return result;
}

// メイン
async function run(){
  const list = "https://www.yomiuri.co.jp/election/shugiin/2026winners001/";

  const links = await getDetailLinks(list);

  const results = [];

  for(const link of links){
    const r = await extractWinner(link);
    if(r) results.push(r);
  }

  console.log("count:", results.length);
  console.log(JSON.stringify(results, null, 2));
}

run();
