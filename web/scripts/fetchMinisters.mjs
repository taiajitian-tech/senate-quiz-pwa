
import fs from "fs/promises";
import cheerio from "cheerio";

const OUT = "web/public/data/ministers.json";

const CABINET_PAGE = "https://www.kantei.go.jp/jp/105/meibo/index.html";

async function fetchHTML(url){
  const res = await fetch(url);
  if(!res.ok) throw new Error("fetch failed "+url);
  return await res.text();
}

function unique(arr){
  return [...new Set(arr)];
}

async function extractImageFromPage(url){
  try{
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const imgs = [];

    $("meta[property='og:image']").each((_,e)=>{
      imgs.push($(e).attr("content"));
    });

    $("img").each((_,e)=>{
      const src = $(e).attr("src");
      if(src && src.match(/\.(jpg|jpeg|png)$/i)){
        if(src.startsWith("http")) imgs.push(src);
      }
    });

    return unique(imgs).slice(0,3);
  }catch{
    return [];
  }
}

async function searchFallback(name){
  const q = encodeURIComponent(name+" site:kantei.go.jp OR site:go.jp");
  const url = "https://duckduckgo.com/html/?q="+q;

  try{
    const html = await fetchHTML(url);
    const $ = cheerio.load(html);
    const links = [];

    $("a.result__a").each((_,e)=>{
      const href=$(e).attr("href");
      if(href) links.push(href);
    });

    return links.slice(0,3);
  }catch{
    return [];
  }
}

async function main(){
  const html = await fetchHTML(CABINET_PAGE);
  const $ = cheerio.load(html);

  const list=[];

  $(".member, li").each((_,e)=>{
    const name=$(e).text().trim();
    const link=$(e).find("a").attr("href");

    if(!name) return;

    list.push({
      name,
      role:"",
      link: link? new URL(link,CABINET_PAGE).href : null
    });
  });

  const result=[];

  for(const m of list){
    let images=[];

    if(m.link){
      images=await extractImageFromPage(m.link);
    }

    if(images.length===0){
      const links=await searchFallback(m.name);
      for(const l of links){
        const imgs=await extractImageFromPage(l);
        if(imgs.length){
          images=imgs;
          break;
        }
      }
    }

    result.push({
      name:m.name,
      role:m.role,
      images
    });
  }

  await fs.mkdir("web/public/data",{recursive:true});
  await fs.writeFile(OUT,JSON.stringify(result,null,2));

  console.log("ministers.json generated:",result.length);
}

main();
