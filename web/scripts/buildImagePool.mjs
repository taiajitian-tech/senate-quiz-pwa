
const BASE = 'https://www.yomiuri.co.jp'
const LIST_URL = 'https://www.yomiuri.co.jp/election/shugiin/2026candidates/'

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0'
    }
  })
  return await res.text()
}

function extractCandidateLinks(html) {
  const matches = [...html.matchAll(/<a href="(\/election\/shugiin\/2026\/[^"]+)"/g)]
  const links = [...new Set(matches.map(m => BASE + m[1]))]
  return links
}

function extractImage(html) {
  const match = html.match(/election-shugiin-profile__photo[\s\S]*?<img[^>]+src="([^"]+)"/)
  if (!match) return null

  let src = match[1]

  if (src.startsWith('/')) {
    src = BASE + src
  }

  return src
}

async function main() {
  console.log('fetch list...')
  const listHtml = await fetchHtml(LIST_URL)

  const links = extractCandidateLinks(listHtml)
  console.log('candidate count =', links.length)

  let success = 0
  let fail = 0

  for (const link of links) {
    try {
      const html = await fetchHtml(link)
      const img = extractImage(html)

      if (img) {
        console.log(img)
        success++
      } else {
        fail++
      }
    } catch {
      fail++
    }
  }

  console.log('success =', success)
  console.log('fail =', fail)
}

main()
