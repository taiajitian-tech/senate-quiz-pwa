import fs from 'fs'
import path from 'path'

const DATA_DIR = './public/data'
const CURRENT_PATH = path.join(DATA_DIR, 'representatives.json')
const MERGED_PATH = path.join(DATA_DIR, 'representatives.yomiuri.merged.json')
const BACKUP_PATH = path.join(DATA_DIR, 'representatives.backup.before-yomiuri.json')

function main() {
  if (!fs.existsSync(MERGED_PATH)) {
    throw new Error(`merged file not found: ${MERGED_PATH}`)
  }
  if (!fs.existsSync(CURRENT_PATH)) {
    throw new Error(`current file not found: ${CURRENT_PATH}`)
  }

  const current = fs.readFileSync(CURRENT_PATH, 'utf-8')
  const merged = fs.readFileSync(MERGED_PATH, 'utf-8')

  fs.writeFileSync(BACKUP_PATH, current)
  fs.writeFileSync(CURRENT_PATH, merged)

  const data = JSON.parse(merged)
  const filled = data.filter(x => String(x.image ?? '').trim() !== '').length
  const missing = data.length - filled

  console.log('backup:', BACKUP_PATH)
  console.log('updated:', CURRENT_PATH)
  console.log('total:', data.length)
  console.log('with-image:', filled)
  console.log('missing:', missing)
}

main()
