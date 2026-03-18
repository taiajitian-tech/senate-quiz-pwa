変更対象のみ同梱
- .github/workflows/update-representatives.yml
- web/scripts/fetchNhkAnyway.mjs

内容
- とにかく NHK 一覧HTMLの img を直取り
- 相対パス /senkyo-data/.../photo/*.jpg を絶対URL化
- NHKドメイン限定の誤フィルタを廃止
- missing → report → fix の順で実行
