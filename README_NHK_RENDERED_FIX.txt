変更対象のみ同梱

- .github/workflows/update-representatives.yml
- web/scripts/fetchNhkWinnersImages.mjs

内容
- 読売依存を外し、NHK当選当確ページ群を Puppeteer で描画後に取得
- 入口0件・カード0件ならその場で失敗終了
- 既存画像は missing のみ更新し、その後 report を再生成
- face_too_far 等の fix-target だけを 2回目で差し替え
