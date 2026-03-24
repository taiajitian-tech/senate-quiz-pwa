
import fs from 'fs'

const REPS_PATH = './public/data/representatives.json'
const PAIRS_PATH = './yomiuri_list_pairs_direct.json'
const OUT_PATH = './public/data/representatives.yomiuri.merged.json'

function normalizeName(name) {
  return String(name ?? '')
    .replace(/[ 　]/g, '')
    .replace(/（.*?）/g, '')
    .replace(/\(.*?\)/g, '')
    .replace(/[‐-‒–—―ーｰ\-]/g, '')
    .trim()
}

function buildMap(pairs) {
  const map = new Map()
  for (const p of pairs) {
    const key = normalizeName(p.name)
    if (!map.has(key)) {
      map.set(key, p)
    }
  }
  return map
}

function main() {
  const reps = JSON.parse(fs.readFileSync(REPS_PATH, 'utf-8'))
  const pairs = JSON.parse(fs.readFileSync(PAIRS_PATH, 'utf-8'))

  const map = buildMap(pairs)

  let filled = 0
  let skipped = 0
  let noMatch = 0

  const updated = reps.map(rep => {
    const key = normalizeName(rep.name)

    if (rep.image && rep.image.trim() !== '') {
      skipped++
      return rep
    }

    const hit = map.get(key)

    if (!hit) {
      noMatch++
      return rep
    }

    filled++

    return {
      ...rep,
      image: hit.image,
      imageSource: 'yomiuri',
      imageStatus: 'review',
      imageMatchedBy: 'yomiuri-merge-name'
    }
  })

  fs.writeFileSync(OUT_PATH, JSON.stringify(updated, null, 2))

  console.log('total:', reps.length)
  console.log('filled:', filled)
  console.log('skipped:', skipped)
  console.log('noMatch:', noMatch)
  console.log('output:', OUT_PATH)
}

main()
