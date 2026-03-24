
import fs from 'fs'

const INDEX_URL = 'https://www.yomiuri.co.jp/election/shugiin/2026candidates/'
const REPS_PATH = './public/data/representatives.json'
const PAIRS_PATH = './yomiuri_list_pairs_direct.json'
const OUT_PATH = './public/data/representatives.yomiuri.list.direct.matched.json'

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

async function fetchText(url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status}`)
  return await res.text()
}

function extract(html) {
  const rows = []
  const liRe = /<li\b[^>]*class="[^"]*result[^"]*"[^>]*>[\s\S]*?<\/li>/gi
  let m

  while ((m = liRe.exec(html))) {
    const block = m[0]

    const nameMatch = block.match(/<span[^>]*candidate-name[^>]*>([\s\S]*?)<\/span>/i)
    const hrefMatch = block.match(/<a[^>]*href="([^"]+)"/i)
    const imgMatch = block.match(/<img[^>]*src="([^"]+)"/i)

    const nameRaw = stripTags(nameMatch ? nameMatch[1] : '')
    const name = normalizeName(nameRaw)
    const url = absUrl(hrefMatch ? hrefMatch[1] : '')
    const image = absUrl(imgMatch ? imgMatch[1] : '')

    if (!name || !url || !image) continue

    rows.push({ name, nameRaw, url, image })
  }

  // ★ここが修正点（名前だけでユニーク）
  const map = new Map()
  for (const r of rows) {
    if (!map.has(r.name)) {
      map.set(r.name, r)
    }
  }

  return Array.from(map.values())
}

async function main() {
  const html = await fetchText(INDEX_URL)
  const pairs = extract(html)

  fs.writeFileSync(PAIRS_PATH, JSON.stringify(pairs, null, 2))
  console.log('pairs:', pairs.length)
}

main()
