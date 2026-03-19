上書き対象:
web/scripts/fetchNhkAnyway.mjs

今回の作り直し内容:
- NHK画像は img alt + src を直接取得
- NHK一覧ブロック内からも画像を取得
- fix モードでは既存画像があっても上書き
- NHKで取れない場合のみ imageSourceUrl / profileUrl を補助取得
