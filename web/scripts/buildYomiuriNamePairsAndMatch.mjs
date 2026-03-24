
import fs from 'fs'

const INDEX_URL = 'https://www.yomiuri.co.jp/election/shugiin/2026candidates/'
const REPS_PATH = './public/data/representatives.json'
const OUT_PATH = './public/data/representatives.yomiuri.fixed.matched.json'

function fetchText(url) {
  return fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'ja'
    }
  }).then(r => r.text())
}

// ===== 名前正規化 =====
function normalizeName(name) {
  return String(name || '')
    .replace(/[ 　]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[‐‑‒–—―ーｰ\-]/g, '')
    .trim()
}

// よくある置換
const replaceMap = [
  ['髙','高'],
  ['﨑','崎'],
  ['邊','辺'],
  ['齊','斉'],
  ['澤','沢'],
  ['廣','広'],
  ['神','神'],
  ['德','徳']
]

function expandVariants(name){
  const list = new Set([normalizeName(name)])
  for(const [a,b] of replaceMap){
    if(name.includes(a)){
      list.add(normalizeName(name.replaceAll(a,b)))
    }
    if(name.includes(b)){
      list.add(normalizeName(name.replaceAll(b,a)))
    }
  }
  return [...list]
}

// ===== リンク抽出（厳格） =====
function extractLinks(html){
  const results = []
  const re = /<li[^>]*class="[^"]*result[^"]*"[\s\S]*?<a[^>]*href="([^"]+)"/g
  let m
  while((m = re.exec(html))){
    const href = m[1]
    if(href.startsWith('/election/shugiin/2026/')){
      results.push('https://www.yomiuri.co.jp' + href)
    }
  }
  return [...new Set(results)]
}

// ===== 名前抽出（限定） =====
function extractName(html){
  const m = html.match(/<h1[^>]*>(.*?)<\/h1>/i)
  if(!m) return ''
  return m[1]
    .replace(/<[^>]+>/g,'')
    .trim()
}

// ===== 画像抽出 =====
function extractImage(html){
  const m = html.match(/election-shugiin-profile__photo[\s\S]*?<img[^>]*src="([^"]+)"/i)
  if(!m) return ''
  let url = m[1]
  if(url.startsWith('/')){
    url = 'https://www.yomiuri.co.jp' + url
  }
  return url
}

async function main(){

  const reps = JSON.parse(fs.readFileSync(REPS_PATH,'utf-8'))

  const indexHtml = await fetchText(INDEX_URL)
  const links = extractLinks(indexHtml)

  console.log('links:', links.length)

  const pairs = []

  for(const url of links){
    try{
      const html = await fetchText(url)
      const name = extractName(html)
      const image = extractImage(html)

      if(name && image){
        pairs.push({
          name,
          norm: normalizeName(name),
          variants: expandVariants(name),
          image
        })
      }
    }catch(e){}
  }

  console.log('pairs:', pairs.length)

  let matched = 0

  const updated = reps.map(rep => {

    if(rep.image) return rep

    const names = expandVariants(rep.name)

    for(const p of pairs){
      for(const v of names){
        if(p.variants.includes(v)){
          matched++
          return {
            ...rep,
            image: p.image,
            imageSource: 'yomiuri',
            imageStatus: 'review'
          }
        }
      }
    }

    return rep
  })

  fs.writeFileSync(OUT_PATH, JSON.stringify(updated,null,2))

  console.log('matched:', matched)
  console.log('output:', OUT_PATH)
}

main()
