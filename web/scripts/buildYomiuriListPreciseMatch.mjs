import fs from 'fs'

const INDEX_URL = 'https://www.yomiuri.co.jp/election/shugiin/2026candidates/'
const REPS_PATH = './public/data/representatives.json'
const PAIRS_PATH = './yomiuri_list_pairs_precise.json'
const OUT_PATH = './public/data/representatives.yomiuri.list.precise.matched.json'

function htmlDecode(s) {
  return String(s ?? '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
}

function stripTags(s) {
  return htmlDecode(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

function absUrl(url) {
  const s = String(url ?? '').trim()
  if (!s) return ''
  if (/^https?:\/\//i.test(s)) return s
  if (s.startsWith('//')) return 'https:' + s
  if (s.startsWith('/')) return 'https://www.yomiuri.co.jp' + s
  return s
}

function normalizeName(name) {
  return String(name ?? '')
    .replace(/[ 　]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[‐‑‒–—―ーｰ\-]/g, '')
    .trim()
}

const replaceMap = [
  ['髙','高'],
  ['﨑','崎'],
  ['邊','辺'],
  ['邉','辺'],
  ['齊','斉'],
  ['齋','斎'],
  ['澤','沢'],
  ['廣','広'],
  ['德','徳'],
  ['濵','浜'],
  ['濱','浜'],
  ['嶋','島'],
  ['桒','桑'],
  ['冨','富'],
  ['榮','栄'],
]

function expandVariants(name) {
  const base = normalizeName(name)
  const set = new Set([base])
  let changed = true

  while (changed) {
    changed = false
    for (const current of Array.from(set)) {
      for (const [a, b] of replaceMap) {
        if (current.includes(a)) {
          const next = current.split(a).join(b)
          if (!set.has(next)) {
            set.add(next)
            changed = true
          }
        }
        if (current.includes(b)) {
          const next = current.split(b).join(a)
          if (!set.has(next)) {
            set.add(next)
            changed = true
          }
        }
      }
    }
  }

  return Array.from(set).filter(Boolean)
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      'user-agent': 'Mozilla/5.0',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    },
  })
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} ${url}`)
  return await res.text()
}

function extractSections(html) {
  const sections = []
  const sectionRe = /<section\b[^>]*class="[^"]*\belection-candidate-top-list-section\b[^"]*"[\s\S]*?<\/section>/gi
  let m
  while ((m = sectionRe.exec(html))) {
    const sectionHtml = m[0]
    const titleMatch = sectionHtml.match(/<h2\b[^>]*class="[^"]*\belection-candidate-top-list-section__title\b[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
    const district = stripTags(titleMatch ? titleMatch[1] : '')
    sections.push({ district, html: sectionHtml })
  }
  return sections
}

function extractPairsFromSection(sectionHtml, district) {
  const pairs = []
  const liRe = /<li\b[^>]*class="([^"]*\bresult\b[^"]*)"[^>]*data-keyword="([^"]*)"([^>]*)>[\s\S]*?<\/li>/gi
  let m

  while ((m = liRe.exec(sectionHtml))) {
    const block = m[0]
    const className = m[1] || ''
    const keyword = htmlDecode(m[2] || '')
    const restAttrs = m[3] || ''

    const nameMatch = block.match(/<span\b[^>]*class="[^"]*\bcandidate-name\b[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
    const hrefMatch = block.match(/<a\b[^>]*href="([^"]+)"/i)
    const imgMatch = block.match(/<figure\b[^>]*class="[^"]*\bcandidate-photo\b[^"]*"[\s\S]*?<img\b[^>]*src="([^"]+)"/i)

    const dataSenkyokuMatch = restAttrs.match(/data-senkyoku="([^"]*)"/i)
    const dataTohaMatch = restAttrs.match(/data-toha="([^"]*)"/i)
    const dataTorakuMatch = restAttrs.match(/data-toraku="([^"]*)"/i)

    let nameRaw = stripTags(nameMatch ? nameMatch[1] : '')
    if (!nameRaw) {
      const tokens = keyword.split(/\s+/).map(v => v.trim()).filter(Boolean)
      nameRaw = tokens[0] || ''
    }

    const name = normalizeName(nameRaw)
    const url = absUrl(hrefMatch ? hrefMatch[1] : '')
    const image = absUrl(imgMatch ? imgMatch[1] : '')
    const statusToken = (className.split(/\s+/).find(v => v.startsWith('result_')) || '').trim()

    if (!name || !url || !image) continue

    pairs.push({
      district,
      name,
      nameRaw,
      url,
      image,
      keyword,
      status: statusToken,
      senkyoku: htmlDecode(dataSenkyokuMatch ? dataSenkyokuMatch[1] : ''),
      party: htmlDecode(dataTohaMatch ? dataTohaMatch[1] : ''),
      toraku: htmlDecode(dataTorakuMatch ? dataTorakuMatch[1] : ''),
      variants: expandVariants(nameRaw),
    })
  }

  return pairs
}

function uniquePairs(rows) {
  const map = new Map()
  for (const row of rows) {
    const key = `${row.name}__${row.url}__${row.image}`
    if (!map.has(key)) map.set(key, row)
  }
  return Array.from(map.values())
}

function repNameCandidates(rep) {
  const raw = [
    rep.name,
    rep.displayName,
    rep.fullName,
    rep.kanji,
  ].map(v => String(v ?? '').trim()).filter(Boolean)

  const set = new Set()
  for (const name of raw) {
    for (const v of expandVariants(name)) {
      set.add(v)
    }
  }
  return Array.from(set)
}

async function main() {
  const reps = JSON.parse(fs.readFileSync(REPS_PATH, 'utf-8'))
  const html = await fetchText(INDEX_URL)

  const sections = extractSections(html)
  let pairs = []
  for (const section of sections) {
    pairs.push(...extractPairsFromSection(section.html, section.district))
  }
  pairs = uniquePairs(pairs)

  fs.writeFileSync(PAIRS_PATH, JSON.stringify(pairs, null, 2))

  console.log('sections:', sections.length)
  console.log('pairs:', pairs.length)

  let matched = 0
  let alreadyHadImage = 0
  let noMatch = 0
  let ambiguous = 0

  const updated = reps.map((rep) => {
    const currentImage = String(rep.image ?? '').trim()
    if (currentImage) {
      alreadyHadImage += 1
      return rep
    }

    const names = repNameCandidates(rep)
    const hits = pairs.filter((p) => names.some((n) => p.variants.includes(n)))

    if (hits.length === 0) {
      noMatch += 1
      return rep
    }

    if (hits.length > 1) {
      ambiguous += 1
      return {
        ...rep,
        imageStatus: 'review',
        imageMatchedBy: 'yomiuri-list-precise-ambiguous',
        imageCandidates: hits.map(h => h.image),
        imageCandidateUrls: hits.map(h => h.url),
      }
    }

    matched += 1
    const hit = hits[0]
    return {
      ...rep,
      image: hit.image,
      imageSource: 'yomiuri',
      imageStatus: 'review',
      imageMatchedBy: 'yomiuri-list-precise-name',
      imageMatchedName: hit.nameRaw,
      imageMatchedUrl: hit.url,
      imageMatchedDistrict: hit.district,
      imageMatchedStatus: hit.status,
    }
  })

  fs.writeFileSync(OUT_PATH, JSON.stringify(updated, null, 2))

  console.log('representatives:', reps.length)
  console.log('matched:', matched)
  console.log('already-had-image:', alreadyHadImage)
  console.log('no-match:', noMatch)
  console.log('ambiguous:', ambiguous)
  console.log('pairs-output:', PAIRS_PATH)
  console.log('output:', OUT_PATH)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
