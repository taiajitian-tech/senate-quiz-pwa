NHK取得修正メモ

- workflow の NHK 呼び出しは npm run nhk:card に変更
- 実体は web/scripts/fetchNhkByCard.mjs
- fetchNhkAnyway.mjs は互換用の委譲だけ
- .git は ZIP から除外して渡すこと

手動確認箇所
1. GitHub Actions の Fill only missing representative images from NHK HTML
2. ログに nhk-card page=... cards=... が出ること
3. 完了ログに matched / missing が出ること
