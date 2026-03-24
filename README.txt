差し替え対象
web/scripts/buildImagePool.mjs
web/src/components/TitleView.tsx

修正内容
1. buildImagePool.mjs を追加
2. 「最初に」と「学習」が同じ色だった問題を修正
   - 「学習」だけ青系
   - 「最初に」は通常色
3. 「おすすめの順番」をメニューの後ろへ移動
   - 「オプション」の後ろに表示される位置へ変更

実行
作業場所が senate-quiz-pwa/web のとき:
node scripts/buildImagePool.mjs

出力
web/public/data/image_pool.json
