
import fs from 'fs'

const INPUT_PATH = './public/data/representatives.yomiuri.merged.json'
const OUT_PATH = './remaining_no_match.json'

function main() {
  const data = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'))

  const noMatch = data.filter(d => !d.image || d.image.trim() === '')

  console.log('remaining:', noMatch.length)

  fs.writeFileSync(OUT_PATH, JSON.stringify(noMatch, null, 2))
}

main()
