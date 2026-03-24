差し替え対象
web/scripts/rejectWikipediaImages.mjs

実行場所
senate-quiz-pwa/web

実行
node scripts/rejectWikipediaImages.mjs

内容
- representatives.json の image が Wikipedia / Wikimedia 画像なら空にする
- imageCandidates 内の Wikipedia / Wikimedia URL を削除する
- image が空になった後は、候補ありなら review、候補なしなら missing にする
