NHK取得修正版

変更点
- web/scripts/fetchNhkByCard.mjs を追加
- update-representatives workflow の NHK実行を npm run nhk:card に変更
- fetchNhkAnyway.mjs は fetchNhkByCard.mjs へ委譲
- web/package.json に nhk:card を追加

実行
1. このZIPを展開
2. 中身をリポジトリへ上書き（.git は同梱していません）
3. push
4. GitHub Actions > update-representatives を実行

補足
- NHK側が 404 / レイアウト変更でも、workflow 全体はここで即死しないようにしています。
- news.web.nhk と www3.nhk.or.jp の両方を試します。
- candidate系セレクタ優先、取れない場合は img 周辺テキストの exact-name fallback を試します。
