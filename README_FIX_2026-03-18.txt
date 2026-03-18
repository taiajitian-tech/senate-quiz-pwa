上書き対象
- web/scripts/fetchNhkAnyway.mjs

今回の修正
- Lintエラー（Parsing error: Unterminated regular expression）を修正
- GitHub Actions の update-representatives.yml が呼ぶ既存ファイル名を維持
- NHK画像取得は img alt の氏名を完全一致で見る方式に整理
- 保存先は workflow 前提どおり web 作業ディレクトリ基準の public/data/representatives.json

確認済み
- node --check scripts/fetchNhkAnyway.mjs 通過
- npm run lint 通過
