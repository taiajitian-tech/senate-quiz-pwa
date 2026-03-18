原因確認
- アップロードされた現在ZIPを確認したところ、workflow は browser=false に変わっていました。
- しかし autoImageFetch.mjs の normalizeUrl() は旧版のままでした。
- そのため v5 のURL修正が作業フォルダに実際には入っていませんでした。

今回の修正
- normalizeUrl() の https:// 破壊を修正
- yomiuri-fix-version=v6 ログを追加
- sample-candidate-url ログを追加
- workflow の browser=false を維持
