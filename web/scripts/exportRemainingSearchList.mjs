import fs from 'fs'

const INPUT_PATH = './remaining_no_match.json'
const JSON_OUT = './remaining_no_match_search_list.json'
const TXT_OUT = './remaining_no_match_search_queries.txt'

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`input file not found: ${INPUT_PATH}`)
  }

  const rows = JSON.parse(fs.readFileSync(INPUT_PATH, 'utf-8'))

  const list = rows.map((row, index) => {
    const name = String(row.name ?? '').trim()
    return {
      index: index + 1,
      name,
      query: `${name} 衆議院 顔`,
      queryAlt1: `${name} プロフィール`,
      queryAlt2: `${name} 公式`,
    }
  })

  fs.writeFileSync(JSON_OUT, JSON.stringify(list, null, 2))
  fs.writeFileSync(TXT_OUT, list.map(x => `${x.index}. ${x.query}`).join('\n') + '\n')

  console.log('remaining:', list.length)
  console.log('json:', JSON_OUT)
  console.log('txt:', TXT_OUT)
}

main()
