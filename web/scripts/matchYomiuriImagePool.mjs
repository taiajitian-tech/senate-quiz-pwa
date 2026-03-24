import fs from 'fs'
import path from 'path'

const repsPath = './public/data/representatives.json'
const poolPath = './image_pool.json'
const outPath = './public/data/representatives.yomiuri.matched.json'

const reps = JSON.parse(fs.readFileSync(repsPath, 'utf-8'))
const pool = JSON.parse(fs.readFileSync(poolPath, 'utf-8'))

function normalize(v) {
  return String(v ?? '').trim().toUpperCase()
}

function collectCandidateKeys(rep) {
  const keys = new Set()

  const directKeys = [
    rep.id,
    rep.code,
    rep.externalId,
    rep.external_id,
    rep.sourceId,
    rep.source_id,
    rep.yomiuriId,
    rep.yomiuri_id,
    rep.imageId,
    rep.image_id,
  ]

  for (const v of directKeys) {
    const n = normalize(v)
    if (n) keys.add(n)
  }

  const nestedSources = Array.isArray(rep.sources) ? rep.sources : []
  for (const src of nestedSources) {
    if (!src || typeof src !== 'object') continue
    for (const k of ['id', 'code', 'externalId', 'external_id', 'sourceId', 'source_id', 'yomiuriId', 'yomiuri_id']) {
      const n = normalize(src[k])
      if (n) keys.add(n)
    }
  }

  return [...keys]
}

const poolMap = new Map()
for (const row of pool) {
  const id = normalize(row.id)
  const image = String(row.image ?? '').trim()
  if (!id || !image) continue
  if (!poolMap.has(id)) poolMap.set(id, image)
}

let matched = 0
let alreadyHadImage = 0
let noKey = 0
let noMatch = 0

const updated = reps.map((rep) => {
  const currentImage = String(rep.image ?? '').trim()

  if (currentImage) {
    alreadyHadImage += 1
    return rep
  }

  const keys = collectCandidateKeys(rep)
  if (keys.length === 0) {
    noKey += 1
    return rep
  }

  const hit = keys.find((k) => poolMap.has(k))
  if (!hit) {
    noMatch += 1
    return rep
  }

  matched += 1

  return {
    ...rep,
    image: poolMap.get(hit),
    imageSource: 'yomiuri',
    imageStatus: rep.imageStatus && rep.imageStatus !== 'missing' ? rep.imageStatus : 'review',
    imageMatchedBy: 'yomiuri-id',
    imageMatchedKey: hit,
  }
})

fs.writeFileSync(outPath, JSON.stringify(updated, null, 2))

console.log('pool:', pool.length)
console.log('representatives:', reps.length)
console.log('matched:', matched)
console.log('already-had-image:', alreadyHadImage)
console.log('no-key:', noKey)
console.log('no-match:', noMatch)
console.log('output:', outPath)
