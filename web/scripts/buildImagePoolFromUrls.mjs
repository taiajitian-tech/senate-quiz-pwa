
import fs from 'fs'

const inputPath = './image_urls.txt' // 1行1URLで保存しておく前提
const outputPath = './image_pool.json'

const lines = fs.readFileSync(inputPath, 'utf-8')
  .split('\n')
  .map(l => l.trim())
  .filter(Boolean)

// 重複削除
const unique = Array.from(new Set(lines))

const result = []

for (const url of unique) {
  const match = url.match(/\/([^\/]+)_0\.jpg$/)
  if (!match) continue

  const filename = match[1] // YRYA...部分

  result.push({
    id: filename,
    image: url
  })
}

fs.writeFileSync(outputPath, JSON.stringify(result, null, 2))

console.log('total:', lines.length)
console.log('unique:', unique.length)
console.log('output:', result.length)
