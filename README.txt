■ 実行場所
C:\Users\some3\Documents\GitHub\senate-quiz-pwa\web

■ 事前条件
- yomiuri_list_pairs_direct.json が存在する

■ 実行コマンド
node scripts/mergeYomiuriImages.mjs

■ 出力
web\public\data\representatives.yomiuri.merged.json

■ 内容
- imageが空の議員だけ埋める
- 既存imageは上書きしない
